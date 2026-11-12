'use client';
import {useEffect,useState} from 'react';
type Row={id:string;day:string;team_name:string;own:boolean;description:string;status:string;effect:string};
type Report={days:string[];rows:Row[];default_day:string|null;ended:boolean;is_admin:boolean};
function dayLabel(day:string){
 const d=new Date(day+'T12:00:00Z');
 return Number.isNaN(d.getTime())?day:d.toLocaleDateString('fa-IR',{timeZone:'Asia/Tehran',year:'numeric',month:'long',day:'numeric'});
}
export default function ReportClient(){
 const [report,setReport]=useState<Report|null>(null);
 const [day,setDay]=useState('');
 const [manuallySelected,setManuallySelected]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  async function reload(){
   try{
    const res=await fetch('/api/operations-report',{cache:'no-store'});
    const json=await res.json();
    if(!res.ok)throw Error(json.error||'دریافت گزارش ناموفق بود');
    if(!active)return;
    const next=json as Report;
    setReport(next);
    setDay(old=>manuallySelected&&old&&next.days.includes(old)?old:next.default_day||'');
    setError('');
   }catch(e){if(active)setError(e instanceof Error?e.message:'خطا در ارتباط با گزارش');}
  }
  void reload();
  const interval=setInterval(()=>{if(!document.hidden)void reload();},30000);
  return()=>{active=false;clearInterval(interval);};
 },[manuallySelected]);
 const rows=(report?.rows||[]).filter(r=>r.day===day);
 function group(items:Row[],title:string){
  return <div style={{marginTop:16}}>
   <h3>{title}</h3>
   {!items.length?<p className="muted">در این روز عملیاتی برای نمایش ثبت نشده است.</p>:
    items.map(item=><div key={item.id} style={{borderBottom:'1px solid #5e4628',padding:'12px 0'}}>
     <p style={{fontWeight:700,color:'#f5d79b',margin:'0 0 8px'}}>{item.description}</p>
     <p style={{margin:'4px 0'}}>عملیات: <strong className={item.status==='موفق'?'success':item.status==='ناموفق'?'danger':''}>{item.status}</strong></p>
     <p style={{margin:'4px 0'}}>نتیجه: {item.effect}</p>
    </div>)}
  </div>;
 }
 return <section className="card" dir="rtl">
   <h2>⚔️ گزارش روزانه عملیات</h2>
   <p className="muted">هر روز یک گزارش جدا دارد. به‌صورت پیش‌فرض روز قبل نمایش داده می‌شود و می‌توانید روزهای دیگر را انتخاب کنید.</p>
   {error&&<p className="danger" role="alert">{error}</p>}
   {!report&&!error&&<p className="muted">در حال دریافت گزارش...</p>}
   {report&&<>
    <label htmlFor="gv-daily-selector">انتخاب روز</label>
    <select id="gv-daily-selector" value={day}
       onChange={e=>{setManuallySelected(true);setDay(e.target.value);}}>
     {report.days.map(d=><option key={d} value={d}>{dayLabel(d)}</option>)}
    </select>
    {day?<div className="card">
      <h3>📅 عملیات {dayLabel(day)}</h3>
      {!rows.length?<p className="muted">در این روز عملیات قابل‌نمایشی وجود ندارد.</p>:
       report.is_admin
        ? Array.from(new Set(rows.map(r=>r.team_name))).map(team=>
          <div key={team}>{group(rows.filter(r=>r.team_name===team),'عملیات '+team)}</div>)
        : <>
          {group(rows.filter(r=>r.own),'🛡️ عملیات تیم خودی')}
          {group(rows.filter(r=>!r.own),'⚔️ عملیات تیم مقابل')}
         </>}
     </div>:<p className="muted">هنوز روزی برای گزارش وجود ندارد.</p>}
    </>}
   </section>;
}
