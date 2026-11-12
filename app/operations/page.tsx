import {redirect} from 'next/navigation';
import {serverDb} from '../../lib/supabase';
import ReportClient from './report-client';
export const dynamic='force-dynamic';
export default async function OperationsPage(){
 const client=await serverDb();
 const {data:{user}}=await client.auth.getUser();
 if(!user)redirect('/login');
 return <main dir="rtl" style={{maxWidth:850,margin:'0 auto',padding:'20px 15px 80px'}}>
  <a className="btn" href="/" style={{display:'inline-block',marginBottom:15}}>بازگشت به داشبورد</a>
  <ReportClient/>
 </main>;
}
