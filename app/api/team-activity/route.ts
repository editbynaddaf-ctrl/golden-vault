import { NextResponse } from 'next/server';
import { serverDb } from '../../../lib/supabase';
import { adminDb } from '../../../lib/admin';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};

function tehranDate(date=new Date()):string {
  const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tehran',
    year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const part=(type:string)=>p.find(x=>x.type===type)?.value||'';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function isSameOrBefore(date:string,now:string) {return date<=now;}
function dayOffset(day:string,offset:number):string {
  const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);
  return d.toISOString().slice(0,10);
}
function record(raw:unknown):Record<string,unknown>|null {
  if(typeof raw==='string') {try{raw=JSON.parse(raw);}catch{return null;}}
  return raw!==null && typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
}
const outcomeSuccess=new Set([
  'robbery_success_pending_sales','robbery_success',
  'assassination_success_pending_sales','assassination_success','protected',
]);
const outcomeFailure=new Set([
  'blocked_by_protection','guardian_immune','commander_penalty_pending_sales',
  'guardian_penalty_pending_sales','assassination_failed','invalid_target',
  'canceled_by_assassination','game_ended',
]);
const operations:Record<string,string>={
 thief:'سرقت',killer:'ترور',guardian:'محافظت',spy_role:'شناسایی نقش',
 spy_key:'استعلام کلید',spy_shop:'استعلام خریدهای حریف',attack:'فرمان حمله',
 golden_day:'روز طلایی',
};
const roleLabels:Record<string,string>={thief:'سارق',killer:'قاتل',guardian:'محافظ',commander:'فرمانده',spy:'جاسوس'};
const rivalActorLabels:Record<string,string>={thief:'سارق',killer:'قاتل',guardian:'محافظ',spy_role:'جاسوس',spy_key:'جاسوس',spy_shop:'جاسوس',attack:'فرمانده',golden_day:'فرمانده'};

function describe(kind:string,actor:string,target:string|null,enemy:boolean,anonymous:boolean) {
  const name=anonymous?(rivalActorLabels[kind]||'بازیکن')+' حریف':actor;
  if(kind==='thief')return `${name} از ${target||'یکی از بازیکنان'} سرقت کرد.`;
  if(kind==='killer')return `${name} به ${target||'یکی از بازیکنان'} حمله کرد.`;
  if(kind==='guardian')return `${name} از ${target||'یک هم‌تیمی'} محافظت کرد.`;
  if(kind==='spy_role')return `${name} نقش ${target||'یک بازیکن'} را بررسی کرد.`;
  if(kind==='spy_key')return `${name} وضعیت کلید حریف را استعلام کرد.`;
  if(kind==='spy_shop')return `${name} خریدهای تیم حریف را استعلام کرد.`;
  if(kind==='attack')return `${name} فرمان حمله تیمی صادر کرد.`;
  if(kind==='golden_day')return `${name} روز طلایی را فعال کرد.`;
  return `${name} عملیات ${operations[kind]||'بازی'} انجام داد.`;
}
type Entry={
 id:string;day:string;kind:string;actor:string;target:string|null;
 actor_team:boolean;opponent:boolean;actor_team_name:string;created_at:string;
 sentence:string;operation_status:string;effect:string;
 status:string;
};

export async function GET(){
 try{
  const client=await serverDb();
  const {data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:'ابتدا وارد شوید'},{status:401,headers});
  const db=adminDb();
  const {data:me,error:meError}=await db.from('profiles')
    .select('id,team_id,is_admin').eq('id',user.id).maybeSingle();
  if(meError||!me)return NextResponse.json({error:'حساب کاربری معتبر نیست'},{status:403,headers});
  const {data:week,error:weekError}=await db.from('weeks').select('id,starts_on')
    .eq('status','active').maybeSingle();
  if(weekError)throw weekError;
  if(!week)return NextResponse.json({items:[],days:[],default_day:null,game_won:false},{headers});

  const {data:won,error:wonError}=await db.from('game_victories_v3').select('week_id')
    .eq('week_id',week.id).maybeSingle();
  if(wonError)throw wonError;
  const gameWon=Boolean(won);

  const [{data:players,error:playersError},{data:ops,error:opsError},
    {data:ledger,error:ledgerError},{data:teams,error:teamsError}]=await Promise.all([
      db.from('profiles').select('id,name,team_id').eq('is_admin',false),
      db.from('operations').select('id,actor_id,target_id,kind,day,status,result,created_at')
        .eq('week_id',week.id).order('created_at',{ascending:false}).limit(1000),
      db.from('coin_ledger').select('team_id,delta,settlement_key,source_type')
        .eq('week_id',week.id).eq('source_type','daily_settlement').limit(3000),
      db.from('teams').select('id,name'),
    ]);
  if(playersError||opsError||ledgerError||teamsError)throw playersError||opsError||ledgerError||teamsError;
  const person=new Map((players||[]).map(p=>[p.id,p]));
  const teamNames=new Map((teams||[]).map(t=>[t.id,t.name]));
  const team=me.team_id;
  const today=tehranDate();
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tehran',hour:'2-digit',hourCycle:'h23'})
    .format(new Date()));
  const yesterday=dayOffset(today,-1);
  const dates:string[]=[];
  // All days of this round can be chosen, including those with no operations.
  for(let d=week.starts_on;isSameOrBefore(d,today)&&dates.length<120;d=dayOffset(d,1)){
    dates.push(d);
  }
  for(const op of ops||[])if(op.day<=today&&!dates.includes(op.day))dates.push(op.day);
  if(!dates.includes(yesterday) && yesterday>=week.starts_on)dates.push(yesterday);
  dates.sort((a,b)=>b.localeCompare(a));

  const entries:Entry[]=[];
  for(const op of ops||[]){
    const actor=person.get(op.actor_id);
    const target=op.target_id?person.get(op.target_id):null;
    const own=Boolean(team&&actor?.team_id===team);
    const targetedTeam=Boolean(team&&target?.team_id===team);
    const opponent=Boolean(team&&!own);
    // During a live game: allied actions are available immediately.
    // Opponent actions targeting an ally are revealed only after 18:00 Tehran.
     const opponentVisible=op.day<today||(op.day===today&&hour>=18);
    if(!me.is_admin&&!gameWon&&!own&&!(targetedTeam&&opponentVisible))continue;
    const selfAction=op.actor_id===user.id;
    const revealResult=me.is_admin||gameWon||
      (op.day<today||(op.day===today&&hour>=(selfAction?12:18)));
    const d=revealResult?record(op.result):null;
    const outcome=typeof d?.outcome==='string'?d.outcome:'';
    const settled=d?.financial_settled===true;
    const opLedger=revealResult?(ledger||[]).filter(l=>
      typeof l.settlement_key==='string'&&l.settlement_key.includes(op.id)):[];

    let operationStatus='در انتظار اعلام نتیجه';
    if(revealResult){
      if(op.status==='pending')operationStatus='در انتظار بررسی';
      else if(op.status==='canceled'||op.status==='cancelled')operationStatus='لغو شد';
      else if(outcomeFailure.has(outcome))operationStatus='ناموفق';
      else if(outcomeSuccess.has(outcome))operationStatus='موفق';
      else if(outcome==='awaiting_sales'){
        const info=record(d?.attack_details);
        operationStatus=info?.success===true?'موفق':'ناموفق';
      }else if(op.status==='resolved')operationStatus='انجام شد';
    }

    let effect='نتیجه هنوز اعلام نشده است.';
    if(revealResult){
      if(op.status==='pending')effect='نتیجه عملیات هنوز مشخص نشده است.';
      else if(op.status==='canceled'||op.status==='cancelled')effect='این عملیات لغو شد و سکه‌ای بابت آن منتقل نشد.';
      else {
        const earned=opLedger.filter(l=>l.delta>0);
        const lost=opLedger.filter(l=>l.delta<0);
        const credits=earned.reduce((sum,l)=>sum+l.delta,0);
        const debits=lost.reduce((sum,l)=>sum-Math.abs(l.delta),0);
        const creditTeam=earned[0]?.team_id;
        const debitTeam=lost[0]?.team_id;
        const amount=Math.max(credits,Math.abs(debits));
        if(opLedger.length>0){
          if(amount===0)effect='هیچ سکه‌ای بابت این عملیات منتقل نشد.';
          else if(credits>0 && debits<0)
            effect=`${amount} سکه از ${teamNames.get(debitTeam)||'تیم پرداخت‌کننده'} به ${teamNames.get(creditTeam)||'تیم دریافت‌کننده'} منتقل شد.`;
          else if(credits>0)
            effect=`${credits} سکه به ${teamNames.get(creditTeam)||'تیم دریافت‌کننده'} اضافه شد.`;
          else if(debits<0)
            effect=`${Math.abs(debits)} سکه از ${teamNames.get(debitTeam)||'تیم پرداخت‌کننده'} کسر شد.`;
        }else if(outcome==='blocked_by_protection'||outcome==='guardian_immune'||
          outcome==='assassination_failed'||outcome==='invalid_target'||
          outcome==='canceled_by_assassination'||outcome==='game_ended')
          effect='هیچ سکه‌ای بابت این عملیات منتقل نشد.';
        else if(outcome==='protected')
          effect='محافظت ثبت شد؛ این عملیات به‌تنهایی سکه‌ای جابه‌جا نمی‌کند.';
        else if(d&&typeof d.found==='boolean')
          effect=(me.is_admin||gameWon||selfAction)
            ? (d.found?'در زمان استعلام، تیم حریف کلید را پیدا کرده بود.':'در زمان استعلام، کلید هنوز توسط حریف پیدا نشده بود.')
            : 'استعلام انجام شد؛ نتیجه فقط برای جاسوس قابل مشاهده است.';
        else if(typeof d?.role==='string')
          effect=(me.is_admin||gameWon||selfAction)
            ?`نقش شناسایی‌شده: ${roleLabels[d.role]||'نامشخص'}.`
            :'استعلام انجام شد؛ نتیجه فقط برای جاسوس قابل مشاهده است.';
        else if(kindIsSpy(op.kind))
          effect='استعلام انجام شد؛ نتیجه محرمانه فقط برای اجراکننده قابل مشاهده است.';
        else if(!settled)
          effect='تسویه سکه این عملیات هنوز نهایی نشده است.';
        else effect='مبلغ سکه‌ای برای این عملیات به‌صورت مستقل ثبت نشده است.';
      }
    }
    // Enemy attacker identity stays secret until victory, even if their action is known.
    const anonymous=!me.is_admin&&!gameWon&&!own;
    const actorName=anonymous?'بازیکن حریف':actor?.name||'بازیکن';
    const targetName=target?.name||null;
    entries.push({
      id:op.id,day:op.day,kind:op.kind,actor:actorName,
      target:targetName,actor_team:own,opponent,
      actor_team_name:teamNames.get(actor?.team_id||'')||'تیم نامشخص',
      created_at:op.created_at,
      sentence:describe(op.kind,actorName,targetName,opponent,anonymous),
      operation_status:operationStatus,effect,status:op.status,
    });
  }
  return NextResponse.json({
    items:entries,days,default_day:dates.includes(yesterday)?yesterday:(dates[0]||null),
    game_won:gameWon,tehran_day:today
  },{headers});
 }catch{
  return NextResponse.json({error:'دریافت گزارش روزانه عملیات ناموفق بود'},
    {status:500,headers});
 }
}
function kindIsSpy(kind:string){return kind.startsWith('spy_');}
