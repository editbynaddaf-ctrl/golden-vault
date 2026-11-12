'use client';
import {useEffect,useState} from 'react';
import {roleLabels,eventDescription} from './operation-labels';

type Recap={
 week_id:string;won_at:string;winning_key:number;winner_team_name:string;
 roles:{name:string;role:string;team_name:string}[];
 operations:{id:string;actor:string;target:string|null;kind:string;day:string;status:string;result:string|null}[];
 key_checks:{team_name:string;key_number:number;kind:string;result:string}[];
 balances:{team_name:string;balance:number}[];
 events:{id:string;day:string;summary:string;category:string;details:unknown}[];
};

export default function GameRecap({weekId}:{weekId:string}){
 const [recap,setRecap]=useState<Recap|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  fetch('/api/game-recap?week_id='+encodeURIComponent(weekId),{cache:'no-store'})
   .then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error||'خطا در دریافت گزارش');return j;})
   .then(j=>{if(active){setRecap(j.recap);setError('');}})
   .catch(e=>{if(active)setError(String(e.message||e));});
  return ()=>{active=false;};
 },[weekId]);
 if(error)return <p className="danger">{error}</p>;
 if(!recap)return <p className="muted">در حال دریافت گزارش پایان بازی...</p>;
 return <section className="card" dir="rtl" id="gv-recap">
  <h2>🏆 گزارش کامل بازی برای هر دو تیم</h2>
  <p><strong>تیم برنده: {recap.winner_team_name}</strong> · کلید اصلی: {recap.winning_key} ·
  {' '}زمان پیروزی: {new Date(recap.won_at).toLocaleString('fa-IR',{timeZone:'Asia/Tehran'})}</p>
  <h3>🎭 نقش تمام بازیکنان</h3>
  {recap.roles.map((r,i)=><p key={i}>{r.team_name} · <strong>{r.name}</strong> — {roleLabels[r.role]||'نقش نامشخص'}</p>)}
  <h3>🪙 موجودی تیم‌ها</h3>
  {recap.balances.map((b,i)=><p key={i}>{b.team_name}: <strong>{b.balance.toLocaleString('fa-IR')} سکه</strong></p>)}
  <h3>🗝️ آزمایش‌ها و حذف کلیدها</h3>
  {recap.key_checks.length===0?<p>آزمایشی ثبت نشده است.</p>:recap.key_checks.map((k,i)=><p key={i}>
    {k.team_name}، کلید شماره {k.key_number} را {k.kind==='test'?'آزمایش':'از گزینه‌ها حذف'} کرد؛
    {' '}{k.result==='correct'?'✅ این همان کلید برنده بود.':'❌ کلید اشتباه بود.'}
  </p>)}
  <p className="muted">برای مشاهده عملیات و اثر سکه‌های هر روز، از بخش «گزارش روزانه عملیات» و انتخاب تاریخ استفاده کنید.</p>
  <h3>📜 سایر رویدادهای ثبت‌شده</h3>
  {recap.events.length===0?<p>رویدادی ثبت نشده است.</p>:recap.events.map(e=><article className="card" key={e.id}>
   <strong>{e.day} · {e.summary}</strong>
   {eventDescription(e.summary,e.details).map((line,i)=><p key={i} className="mini">{line}</p>)}
  </article>)}
 </section>;
}
