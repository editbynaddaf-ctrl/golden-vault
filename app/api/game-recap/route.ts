import { NextResponse } from 'next/server';
import { serverDb } from '../../../lib/supabase';
import { adminDb } from '../../../lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const fail = (message:string, status=400) => NextResponse.json({error:message},{status,headers});

export async function GET(req:Request) {
  try {
    const client=await serverDb();
    const {data:{user}}=await client.auth.getUser();
    if(!user)return fail('ابتدا وارد شوید',401);
    const db=adminDb();
    const {data:profile}=await db.from('profiles').select('id,is_admin,team_id')
      .eq('id',user.id).maybeSingle();
    if(!profile || (!profile.is_admin && !profile.team_id))return fail('دسترسی ندارید',403);

    const url=new URL(req.url);
    const requested=url.searchParams.get('week_id');
    if(requested && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(requested))return fail('شناسه بازی نامعتبر است');
    let winQuery=db.from('game_victories_v3').select('week_id,team_id,key_number,won_at');
    if(requested)winQuery=winQuery.eq('week_id',requested);
    const {data:victory,error:victoryErr}=await winQuery.order('won_at',{ascending:false}).limit(1).maybeSingle();
    if(victoryErr)throw victoryErr;
    if(!victory)return NextResponse.json({recap:null},{headers});
    const id=victory.week_id;
    const [roles,ops,checks,balances,teams,people,events]=await Promise.all([
      db.from('assignments').select('user_id,role').eq('week_id',id),
      db.from('operations').select('id,actor_id,target_id,kind,day,status,result,created_at').eq('week_id',id).order('created_at',{ascending:true}).limit(1000),
      db.from('key_checks').select('team_id,key_number,kind,result,created_at').eq('week_id',id).order('created_at',{ascending:true}),
      db.from('team_balances').select('team_id,balance').eq('week_id',id),
      db.from('teams').select('id,name'),
      db.from('profiles').select('id,name,team_id').eq('is_admin',false),
      db.from('audit_events').select('id,day,category,summary,details,created_at').eq('week_id',id).order('created_at',{ascending:true}).limit(1000),
    ]);
    for(const r of [roles,ops,checks,balances,teams,people,events])if(r.error)throw r.error;
    const names=new Map((people.data??[]).map(p=>[p.id,p.name]));
    const teamNames=new Map((teams.data??[]).map(t=>[t.id,t.name]));
    return NextResponse.json({recap:{
      week_id:id,won_at:victory.won_at,winning_key:victory.key_number,
      winner_team_id:victory.team_id,winner_team_name:teamNames.get(victory.team_id)??'تیم برنده',
      roles:(roles.data??[]).map(a=>({name:names.get(a.user_id)??'بازیکن',role:a.role,
        team_name:teamNames.get((people.data??[]).find(p=>p.id===a.user_id)?.team_id??'')??'نامشخص'})),
      operations:(ops.data??[]).map(o=>({id:o.id,actor:names.get(o.actor_id)??'بازیکن',
        target:o.target_id?names.get(o.target_id)??'بازیکن':null,kind:o.kind,day:o.day,
        status:o.status,result:o.result,created_at:o.created_at})),
      key_checks:(checks.data??[]).map(k=>({...k,team_name:teamNames.get(k.team_id)??'تیم'})),
      balances:(balances.data??[]).map(b=>({team_name:teamNames.get(b.team_id)??'تیم',balance:b.balance})),
      events:events.data??[]
    }},{headers});
  }catch{return fail('دریافت گزارش پایان بازی ناموفق بود',500);}
}
