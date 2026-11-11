'use client';
import {useEffect,useState} from 'react';

type Recap={
  week_id:string;won_at:string;winning_key:number;winner_team_name:string;
  roles:{name:string;role:string;team_name:string}[];
  operations:{id:string;actor:string;target:string|null;kind:string;day:string;status:string;result:string|null}[];
  key_checks:{team_name:string;key_number:number;kind:string;result:string}[];
  balances:{team_name:string;balance:number}[];
  events:{id:string;day:string;summary:string;category:string;details:unknown}[];
};
const roleLabels:Record<string,string>={commander:'فرمانده',thief:'سارق',killer:'قاتل',guardian:'محافظ',spy:'جاسوس'};
const actionLabels:Record<string,string>={thief:'سرقت',killer:'ترور',guardian:'محافظت',spy_role:'جاسوسی نقش',spy_key:'جاسوسی کلید',spy_shop:'جاسوسی فروشگاه',attack:'حمله',golden_day:'روز طلایی'};

export default function GameRecap({weekId}:{weekId:string}){
 const [recap,setRecap]=useState<Recap|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  fetch('/api/game-recap?week_id='+encodeURIComponent(weekId),{cache:'no-store'})
   .then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error||'خطای گزارش');return j;})
   .then(j=>{if(active){setRecap(j.recap);setError('');}})
   .catch(e=>{if(active)setError(String(e.message||e));});
  return ()=>{active=false;};
 },[weekId]);
 if(error)return <p className="danger">{error}</p>;
 if(!recap)return <p className="muted">در حال دریافت گزارش پایان بازی...</p>;
 return <section className="card" dir="rtl" id="gv-recap">
  <h2>🏆 گزارش کامل پایان بازی</h2>
  <p><strong>برنده: {recap.winner_team_name}</strong> · کلید صحیح: {recap.winning_key} · {new Date(recap.won_at).toLocaleString('fa-IR',{timeZone:'Asia/Tehran'})}</p>
  <h3>🎭 نقش تمام بازیکنان</h3>
  {recap.roles.map((r,i)=><p key={i}>{r.team_name} · <strong>{r.name}</strong> — {roleLabels[r.role]||r.role}</p>)}
  <h3>🪙 موجودی تیم‌ها در زمان مشاهده گزارش</h3>
  {recap.balances.map((b,i)=><p key={i}>{b.team_name}: <strong>{b.balance} سکه</strong></p>)}
  <h3>🗝️ تمام آزمایش‌های کلید</h3>
  {recap.key_checks.length===0?<p>آزمایشی ثبت نشده است.</p>:recap.key_checks.map((k,i)=><p key={i}>{k.team_name} · کلید {k.key_number} · {k.kind==='test'?'آزمایش':'حذف'} · {k.result==='correct'?'✅ صحیح':'❌ اشتباه'}</p>)}
  <h3>⚔️ تاریخچه کامل عملیات دو تیم</h3>
  {recap.operations.length===0?<p>عملیاتی ثبت نشده است.</p>:recap.operations.map(o=><article className="card" key={o.id}>
   <strong>{o.day} · {actionLabels[o.kind]||o.kind}</strong>
   <p>{o.actor}{o.target?' ← '+o.target:''} · {o.status}</p>
   {o.result && <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:12}}>{o.result}</pre>}
  </article>)}
  <h3>📜 رویدادها و جزئیات ثبت‌شده</h3>
  {recap.events.length===0?<p>رویدادی ثبت نشده است.</p>:recap.events.map(e=><article className="card" key={e.id}>
   <strong>{e.day} · {e.summary}</strong>
   <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:12}}>{JSON.stringify(e.details,null,2)}</pre>
  </article>)}
 </section>;
}
