'use client';
import {useEffect} from 'react';

export default function Error({error,reset}:{error:Error & {digest?:string};reset:()=>void}) {
  useEffect(()=>{console.error('Golden Vault dashboard error:',error);},[error]);
  return <main dir="rtl" style={{minHeight:'100vh',background:'#101010',color:'#f7d891',padding:24,fontFamily:'sans-serif'}}>
    <h2>خطا در نمایش پنل Golden Vault</h2>
    <p style={{color:'#eee'}}>خطای فنی زیر به ما کمک می‌کند مشکل ورود بازیکنان را پیدا کنیم.</p>
    <pre dir="ltr" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',padding:16,border:'1px solid #9d7738',borderRadius:12,color:'#fff',fontSize:13}}>{error.message || 'Unknown client error'}{error.digest ? '\n'+error.digest : ''}</pre>
    <button onClick={()=>reset()} style={{padding:'12px 20px',background:'#e5b763',border:0,borderRadius:10}}>تلاش دوباره</button>
    <button onClick={()=>location.reload()} style={{padding:'12px 20px',background:'#e5b763',border:0,borderRadius:10,margin:8}}>بارگذاری مجدد</button>
  </main>;
}