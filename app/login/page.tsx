'use client';
import {useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
export default function Login(){const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');const db=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);const {error}=await db.auth.signInWithPassword({email,password});if(error){setError('Invalid email or password.');setBusy(false)}else window.location.href='/'}
return <main style={{maxWidth:480}}><h1>🔐 GOLDEN VAULT</h1><div className="card"><h2>Player Login</h2><form onSubmit={submit}><label>Email Address</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/><p><button disabled={busy}>Enter the Vault</button></p>{error&&<p className="danger">{error}</p>}</form></div></main>}
