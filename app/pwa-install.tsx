'use client';
import {useEffect,useState} from 'react';
type InstallEvent=Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
const dismissKey='golden-vault-pwa-dismissed-until-v1';
export default function PwaInstall(){
 const [visible,setVisible]=useState(false);
 const [platform,setPlatform]=useState<'ios'|'android'|'other'>('other');
 const [secure,setSecure]=useState(false);
 const [deferred,setDeferred]=useState<InstallEvent|null>(null);
 useEffect(()=>{
  const standalone=window.matchMedia('(display-mode: standalone)').matches||
    (window.navigator as Navigator & {standalone?:boolean}).standalone===true;
  if(standalone)return;
  let until=0;try{until=Number(window.localStorage.getItem(dismissKey)||0);}catch{}
  if(until>Date.now())return;
  const agent=navigator.userAgent;
  setPlatform(/iphone|ipad|ipod/i.test(agent)?'ios':/android/i.test(agent)?'android':'other');
  setSecure(window.isSecureContext);
  setVisible(true);
  if(window.isSecureContext && 'serviceWorker' in navigator){
    void navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{});
  }
  function installReady(event:Event){event.preventDefault();setDeferred(event as InstallEvent);}
  function installed(){setVisible(false);}
  window.addEventListener('beforeinstallprompt',installReady);
  window.addEventListener('appinstalled',installed);
  return()=>{
    window.removeEventListener('beforeinstallprompt',installReady);
    window.removeEventListener('appinstalled',installed);
  };
 },[]);
 function dismiss(){
  setVisible(false);
  try{window.localStorage.setItem(dismissKey,String(Date.now()+7*24*3600000));}catch{}
 }
 async function install(){
  if(!deferred)return;
  try{
    await deferred.prompt();
    const result=await deferred.userChoice;
    if(result.outcome==='accepted')setVisible(false);
  }finally{setDeferred(null);}
 }
 if(!visible)return null;
 return <aside dir="rtl" role="dialog" aria-label="نصب گلدن والت"
  style={{position:'fixed',bottom:88,left:14,right:14,maxWidth:410,margin:'0 auto',zIndex:100,
  background:'#1c1710',border:'1px solid #c49a52',boxShadow:'0 10px 40px #000c',
  borderRadius:18,padding:18,color:'#f8dc9a',fontFamily:'inherit'}}>
  <button aria-label="بستن راهنمای نصب" type="button" onClick={dismiss}
    style={{position:'absolute',left:10,top:10,padding:'2px 9px',minWidth:32}}>×</button>
  <div style={{display:'flex',gap:10,alignItems:'center'}}>
    <img src="/golden-vault-icon.svg" alt="" width="52" height="52" style={{borderRadius:12}}/>
    <div><strong style={{display:'block',fontSize:17}}>🎮 نصب Golden Vault</strong>
      <span style={{fontSize:12,color:'#c9b99e'}}>دسترسی سریع به بازی از صفحه اصلی گوشی</span></div>
  </div>
  {deferred && secure
   ? <p>برای نصب نسخه اپلیکیشنی Golden Vault روی «نصب» بزنید.</p>
   : platform==='ios'
     ? <p>در Safari روی دکمه «اشتراک‌گذاری» بزنید و سپس «Add to Home Screen» را انتخاب کنید.</p>
     : secure
       ? <p>از منوی مرورگر گزینه «Install app» یا «Add to Home Screen» را انتخاب کنید.</p>
       : <p>آدرس فعلی HTTP است و نصب کامل PWA فعال نیست. در بعضی مرورگرها می‌توانید از منو یک میانبر به صفحه اصلی اضافه کنید.</p>}
  <div style={{display:'flex',gap:8}}>
   {deferred&&secure&&<button type="button" onClick={()=>void install()}>نصب برنامه</button>}
   <button type="button" onClick={dismiss} style={{background:'#32291c',color:'#f4d48d'}}>متوجه شدم</button>
  </div>
 </aside>;
}
