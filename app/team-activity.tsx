'use client';

import {useEffect,useRef,useState} from 'react';

type Entry={
  id:string;day:string;kind:string;actor:string;target:string|null;
  actor_team:boolean;opponent:boolean;actor_team_name:string;created_at:string;
  sentence:string;operation_status:string;effect:string;status:string;
};
type ResponseData={
  items:Entry[];days:string[];default_day:string|null;
  game_won:boolean;tehran_day:string;
};
function formatDay(d:string):string{
  try {return new Date(d+'T12:00:00Z').toLocaleDateString('fa-IR',{timeZone:'Asia/Tehran',year:'numeric',month:'long',day:'numeric'});}
  catch{return d;}
}
export default function TeamActivity(){
  const [data,setData]=useState<ResponseData|null>(null);
  const [selected,setSelected]=useState('');
  const manualSelection=useRef(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    let mounted=true;
    async function reload(){
      try {
        const r=await fetch('/api/team-activity',{cache:'no-store'});
        const j=await r.json();
        if(!mounted)return;
        if(!r.ok){setError(j.error||'دریافت گزارش ناموفق بود');return;}
        const next=j as ResponseData;
        setData(next);
        // Keep a user-selected date; default to yesterday for newly loaded dashboards.
        setSelected(previous=>manualSelection.current && previous && next.days.includes(previous)
          ? previous : (next.default_day||''));
        setError('');
      }catch{
        if(mounted)setError('ارتباط با گزارش عملیات برقرار نشد.');
      }
    }
    void reload();
    const timer=setInterval(()=>{if(!document.hidden)void reload();},15000);
    return()=>{mounted=false;clearInterval(timer);};
  },[]);
  const entries=(data?.items||[]).filter(e=>e.day===selected);
  const own=entries.filter(e=>e.actor_team);
  const rival=entries.filter(e=>!e.actor_team);
  const adminView=entries.length>0&&entries.every(e=>e.opponent===false&&!e.actor_team);
  const teamNames=Array.from(new Set(entries.map(e=>e.actor_team_name)));
  function renderRows(rows:Entry[],label:string){
    return <div style={{marginTop:15}}>
      <h3 style={{marginBottom:8}}>{label}</h3>
      {rows.length===0?<p className="muted">عملیاتی برای این بخش در روز انتخاب‌شده ثبت نشده است.</p>
        :rows.map(e=><article key={e.id}
          style={{padding:'13px 2px',borderBottom:'1px solid #584329'}}>
          <p style={{margin:'0 0 6px',fontWeight:700,color:'#f1d294'}}>{e.sentence}</p>
          <p style={{margin:'3px 0'}}>
            <strong>عملیات:</strong>{' '}
            <span className={e.operation_status==='موفق'?'success':e.operation_status==='ناموفق'?'danger':'muted'}>
              {e.operation_status}
            </span>
          </p>
          <p style={{margin:'3px 0'}}><strong>نتیجه:</strong> {e.effect}</p>
        </article>)}
    </div>;
  }
  return <section className="card gv-team-activity" id="gv-team-activity" dir="rtl">
    <h2>⚔️ گزارش روزانه عملیات</h2>
    <p className="muted">عملیات و نتیجه آن‌ها به زبان ساده نمایش داده می‌شوند.
      اطلاعات محرمانه تیم مقابل فقط در زمان مجاز یا پس از پایان بازی قابل مشاهده‌اند.</p>
    {error&&<p role="alert" className="danger">{error}</p>}
    <label htmlFor="gv-operations-day">📅 انتخاب تاریخ عملیات</label>
    <select id="gv-operations-day" value={selected}
      onChange={e=>{manualSelection.current=true;setSelected(e.target.value);}}>
      {(data?.days||[]).map(day=>
        <option key={day} value={day}>{formatDay(day)}{day===data?.default_day?' · روز قبل':''}</option>)}
    </select>
    {data&&!selected&&<p className="muted">هنوز روزی برای گزارش وجود ندارد.</p>}
    {selected&&<div className="card" style={{marginTop:12}}>
      <h3>گزارش عملیات {formatDay(selected)}</h3>
      {entries.length===0?<p className="muted">در این روز هیچ عملیات قابل‌نمایشی وجود ندارد.</p>
        : adminView ? teamNames.map(t=>
          <div key={t}>{renderRows(entries.filter(e=>e.actor_team_name===t),'⚔️ عملیات '+t)}</div>)
        : <>
          {renderRows(own,'🛡️ عملیات تیم خودی')}
          {renderRows(rival,'⚔️ عملیات تیم مقابل')}
        </>}
      {data?.game_won&&<p className="muted">بازی پایان یافته و گزارش عملیات هر دو تیم قابل مشاهده است.</p>}
    </div>}
  </section>;
}
