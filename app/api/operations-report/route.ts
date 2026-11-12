import { NextResponse } from 'next/server';
import { serverDb } from '../../../lib/supabase';
import { adminDb } from '../../../lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const roles:Record<string,string>={thief:'سارق',killer:'قاتل',guardian:'محافظ',spy_role:'جاسوس',spy_key:'جاسوس',spy_shop:'جاسوس',attack:'فرمانده',golden_day:'فرمانده'};
function tehranNow(){
  const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const value=(k:string)=>p.find(x=>x.type===k)?.value||'';
  return {day:`${value('year')}-${value('month')}-${value('day')}`,hour:Number(value('hour'))};
}
function yesterday(day:string){
  const date=new Date(day+'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()-1);
  return date.toISOString().slice(0,10);
}
function parse(value:unknown):Record<string,unknown>{
  if(typeof value==='string'){try{value=JSON.parse(value)}catch{return {}}}
  return value && typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}
type Operation={id:string;week_id:string;actor_id:string;target_id:string|null;kind:string;status:string;day:string;result:string|null;created_at:string};
type Ledger={team_id:string;delta:number;settlement_key:string|null};

export async function GET(){
  try{
    const browser=await serverDb();
    const {data:{user}}=await browser.auth.getUser();
    if(!user)return NextResponse.json({error:'ابتدا وارد شوید.'},{status:401,headers});
    const db=adminDb();
    const {data:me,error:authError}=await db.from('profiles').select('id,team_id,is_admin').eq('id',user.id).maybeSingle();
    if(authError||!me||(!me.is_admin&&!me.team_id))
      return NextResponse.json({error:'اجازه دسترسی به گزارش ندارید.'},{status:403,headers});
    const {data:week,error:weekError}=await db.from('weeks').select('id,starts_on').eq('status','active').maybeSingle();
    if(weekError)throw weekError;
    if(!week)return NextResponse.json({days:[],rows:[],default_day:null,ended:false},{headers});
    const [victory,persons,teams,ops,coins]=await Promise.all([
      db.from('game_victories_v3').select('week_id').eq('week_id',week.id).maybeSingle(),
      db.from('profiles').select('id,name,team_id').eq('is_admin',false),
      db.from('teams').select('id,name'),
      db.from('operations').select('id,week_id,actor_id,target_id,kind,status,day,result,created_at').eq('week_id',week.id).order('created_at',{ascending:false}).limit(1000),
      db.from('coin_ledger').select('team_id,delta,settlement_key').eq('week_id',week.id).eq('source_type','daily_settlement').limit(4000)
    ]);
    if([victory,persons,teams,ops,coins].some(x=>x.error))throw Error('database report query failed');
    const ended=Boolean(victory.data);
    const people=new Map((persons.data||[]).map(p=>[p.id,p]));
    const teamNames=new Map((teams.data||[]).map(t=>[t.id,t.name]));
    const now=tehranNow();
    const yesterdayDate=yesterday(now.day);
    const visibleDates=new Set<string>();
    if(week.starts_on<=yesterdayDate)visibleDates.add(yesterdayDate);
    if(week.starts_on<=now.day)visibleDates.add(now.day);
    for(const op of (ops.data||[]) as Operation[])if(op.day<=now.day)visibleDates.add(op.day);
    const days=Array.from(visibleDates).sort((a,b)=>b.localeCompare(a));
    const rows=[];
    for(const op of (ops.data||[]) as Operation[]){
      const actor=people.get(op.actor_id);
      const target=op.target_id?people.get(op.target_id):null;
      const own=Boolean(me.team_id&&actor?.team_id===me.team_id);
      const targeted=Boolean(me.team_id&&target?.team_id===me.team_id);
      const reached18=op.day<now.day||(op.day===now.day&&now.hour>=18);
      const reached12=op.day<now.day||(op.day===now.day&&now.hour>=12);
      // Never disclose opponent actions unrelated to the viewer before the vault opens.
      if(!me.is_admin&&!ended&&!own&&!(targeted&&reached18))continue;
      const actorIsViewer=op.actor_id===user.id;
      const resultVisible=me.is_admin||ended||(actorIsViewer?reached12:reached18);
      const detail=resultVisible?parse(op.result):{};
      const outcome=typeof detail.outcome==='string'?detail.outcome:'';
      const ledgerRows=resultVisible?(coins.data||[] as Ledger[]).filter(x=>x.settlement_key?.includes(op.id)):[];
      const positive=ledgerRows.filter(x=>x.delta>0);
      const negative=ledgerRows.filter(x=>x.delta<0);
      const earned=positive.reduce((n,x)=>n+x.delta,0);
      const spent=negative.reduce((n,x)=>n+Math.abs(x.delta),0);
      let effect='نتیجه مالی هنوز مشخص نشده است.';
      if(!resultVisible)effect='جزئیات در زمان اعلام نتیجه نمایش داده می‌شود.';
      else if(ledgerRows.length){
        if(!earned&&!spent)effect='هیچ سکه‌ای بابت این عملیات جابه‌جا نشد.';
        else if(earned&&spent)effect=`${Math.min(earned,spent)} سکه از ${teamNames.get(negative[0].team_id)||'تیم پرداخت‌کننده'} به ${teamNames.get(positive[0].team_id)||'تیم دریافت‌کننده'} منتقل شد.`;
        else if(earned)effect=`${earned} سکه به ${teamNames.get(positive[0].team_id)||'تیم دریافت‌کننده'} اضافه شد.`;
        else effect=`${spent} سکه از ${teamNames.get(negative[0].team_id)||'تیم پرداخت‌کننده'} کسر شد.`;
      }else if(['blocked_by_protection','guardian_immune','assassination_failed','invalid_target','canceled_by_assassination','game_ended','protected'].includes(outcome))
        effect='هیچ سکه‌ای بابت این عملیات جابه‌جا نشد.';
      else if(op.status==='pending')effect='عملیات هنوز بررسی نشده است.';
      else if(detail.financial_settled===false)effect='تسویه مالی هنوز نهایی نشده است.';
      else if(typeof detail.role==='string')
        effect=(me.is_admin||ended||actorIsViewer)?`نقش شناسایی‌شده: ${({commander:'فرمانده',thief:'سارق',killer:'قاتل',guardian:'محافظ',spy:'جاسوس'} as Record<string,string>)[detail.role]||'نامشخص'}.`:'نتیجه استعلام فقط برای جاسوس قابل مشاهده است.';
      else if(typeof detail.found==='boolean')
        effect=(me.is_admin||ended||actorIsViewer)?(detail.found?'حریف در زمان استعلام کلید را یافته بود.':'حریف در زمان استعلام کلید را پیدا نکرده بود.'):'نتیجه استعلام محرمانه است.';
      else if(op.kind.startsWith('spy_'))effect='استعلام انجام شد؛ نتیجه محرمانه است.';
      else effect='برای این عملیات مبلغ سکه‌ای جداگانه ثبت نشده است.';

      let status='در انتظار اعلام نتیجه';
      if(resultVisible){
        if(op.status==='pending')status='در انتظار بررسی';
        else if(['canceled','cancelled'].includes(op.status))status='لغوشده';
        else if(['blocked_by_protection','guardian_immune','assassination_failed','invalid_target','canceled_by_assassination','commander_penalty_pending_sales','guardian_penalty_pending_sales','game_ended'].includes(outcome))status='ناموفق';
        else if(['robbery_success_pending_sales','assassination_success_pending_sales','protected'].includes(outcome))status='موفق';
        else if(outcome==='awaiting_sales'){
          const attack=parse(detail.attack_details);status=attack.success===true?'موفق':'ناموفق';
        }else if(op.status==='resolved')status='انجام‌شده';
      }
      const anonymize=!me.is_admin&&!ended&&!own;
      const name=anonymize?`${roles[op.kind]||'بازیکن'} حریف`:actor?.name||'بازیکن';
      const targetName=target?.name||'بازیکن';
      const sentences:Record<string,string>={
        thief:`${name} از ${targetName} سرقت کرد.`,
        killer:`${name} به ${targetName} حمله کرد.`,
        guardian:`${name} از ${targetName} محافظت کرد.`,
        spy_role:`${name} نقش ${targetName} را استعلام کرد.`,
        spy_key:`${name} کلید حریف را استعلام کرد.`,
        spy_shop:`${name} خریدهای حریف را استعلام کرد.`,
        attack:`${name} دستور حمله تیمی صادر کرد.`,
        golden_day:`${name} روز طلایی را فعال کرد.`
      };
      rows.push({id:op.id,day:op.day,team_name:teamNames.get(actor?.team_id||'')||'تیم نامشخص',
        own,description:sentences[op.kind]||`${name} عملیات خود را ثبت کرد.`,status,effect});
    }
    return NextResponse.json({days,rows,default_day:days.includes(yesterdayDate)?yesterdayDate:days[0]||null,
      ended,is_admin:me.is_admin},{headers});
  }catch{
    return NextResponse.json({error:'گزارش روزانه فعلاً قابل دریافت نیست.'},{status:500,headers});
  }
}
