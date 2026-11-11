'use client';
import {useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';

export default function Login(){
 const[email,setEmail]=useState('');
 const[password,setPassword]=useState('');
 const[error,setError]=useState('');
 const[busy,setBusy]=useState(false);

 async function submit(e:React.FormEvent){
  e.preventDefault();
  if(busy)return;
  setBusy(true);
  setError('');
  try {
   const db=createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
   );
   // Clear stale sessions associated with an earlier backend configuration.
   // This does not delete user accounts or change player passwords.
   const {error:signInError}=await db.auth.signInWithPassword({
    email:email.trim(),password
   });
   if(signInError){
    const msg=signInError.message||'Unknown authentication error';
    setError(signInError.status===400 && /invalid login credentials/i.test(msg)
     ? 'ایمیل یا رمز واردشده با اطلاعات این پروژه مطابقت ندارد.'
     : 'خطای ورود: '+msg);
    return;
   }
   window.location.assign('/');
  }catch(e){
   setError('خطای ارتباط با سرویس ورود: '+(e instanceof Error?e.message:'خطای نامشخص'));
  }finally{setBusy(false);}
 }
 return <main style={{maxWidth:480}} dir="rtl">
  <h1>🔐 GOLDEN VAULT</h1>
  <div className="card">
   <h2>ورود بازیکنان</h2>
   <form onSubmit={submit}>
    <label>ایمیل</label>
    <input type="email" autoComplete="username" value={email}
     onChange={e=>setEmail(e.target.value)} required/>
    <label>رمز عبور</label>
    <input type="password" autoComplete="current-password" value={password}
     onChange={e=>setPassword(e.target.value)} required/>
    <p><button disabled={busy} type="submit">{busy?'در حال ورود...':'ورود به بازی'}</button></p>
    {error&&<p role="alert" className="danger">{error}</p>}
   </form>
  </div>
 </main>;
}
