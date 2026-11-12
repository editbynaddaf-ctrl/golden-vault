'use client';
export default function Error({reset}:{error:Error;reset:()=>void}){
 return <main dir="rtl" style={{maxWidth:620,margin:'30px auto',padding:20}}>
 <h2>مشکل موقت در گزارش عملیات</h2>
 <p>پنل اصلی بازی مشکلی ندارد. دوباره تلاش کنید یا به داشبورد برگردید.</p>
 <button onClick={reset}>تلاش دوباره</button>
 <a href="/" style={{margin:12}}>بازگشت به پنل</a>
 </main>;
}
