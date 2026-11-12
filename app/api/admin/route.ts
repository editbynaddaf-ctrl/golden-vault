import {NextResponse} from 'next/server';
import {serverDb} from '../../../lib/supabase';
import {adminDb} from '../../../lib/admin';
import {randomInt} from 'crypto';
export const runtime='nodejs';
const bad=(error:string,status=400)=>NextResponse.json({error},{status});
const isoTehran=(offset=0)=>{const fmt=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'});const p=fmt.formatToParts(new Date());const part=(t:string)=>p.find(x=>x.type===t)?.value||'';const d=new Date(Date.UTC(+part('year'),+part('month')-1,+part('day')+offset,12));return d.toISOString().slice(0,10)};
export async function POST(req:Request){
 try{
  const auth=await serverDb();const {data:{user}}=await auth.auth.getUser();if(!user)return bad('ورود لازم است',401);
  const db=adminDb();const {data:me,error:meError}=await db.from('profiles').select('is_admin').eq('id',user.id).single();
  if(meError||!me?.is_admin)return bad('فقط مدیر مجاز است',403);
  const b=await req.json();
  if(b.action==='create_teams'){
   const {data:existing,error:checkError}=await db.from('teams').select('id,name');if(checkError)return bad(checkError.message,500);
   if(existing?.length)return bad('تیم‌ها قبلاً ایجاد شده‌اند؛ برای جلوگیری از تکرار چیزی تغییر نکرد');
   const {error}=await db.from('teams').insert([{name:'تیم امیرعلی'},{name:'تیم میلاد'}]);
   if(error)return bad('ساخت تیم‌ها ناموفق: '+error.message);
   return NextResponse.json({message:'تیم امیرعلی و تیم میلاد ساخته شدند.'});
  }
  if(b.action==='create_player'){
   const name=String(b.name||'').trim(),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||''),teamId=String(b.team_id||'');
   if(name.length<2||name.length>80||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return bad('نام یا ایمیل معتبر نیست');
   if(password.length<12||password.length>128)return bad('رمز عبور باید بین ۱۲ تا ۱۲۸ کاراکتر باشد');
   const {data:active,error:weekError}=await db.from('weeks').select('id').eq('status','active').maybeSingle();
   if(weekError)return bad('بررسی هفته ناموفق: '+weekError.message,500);
   if(active)return bad('در هفته فعال نمی‌توان بازیکن اضافه کرد');
   const {data:team,error:teamError}=await db.from('teams').select('id').eq('id',teamId).maybeSingle();
   if(teamError)return bad('بررسی تیم ناموفق: '+teamError.message,500);
   if(!team)return bad('تیم نامعتبر است');
   const {count,error:countError}=await db.from('profiles').select('id',{count:'exact',head:true}).eq('team_id',teamId).eq('is_admin',false);
   if(countError)return bad(countError.message,500);
   if((count||0)>=5)return bad('ظرفیت این تیم پنج نفر است');
   const {data:created,error:createError}=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name}});
   if(createError||!created.user)return bad('ساخت حساب ناموفق: '+(createError?.message||'خطای نامشخص'));
   const {error:profileError}=await db.from('profiles').upsert({id:created.user.id,name,team_id:teamId,is_admin:false},{onConflict:'id'});
   if(profileError){
    const {error:cleanupError}=await db.auth.admin.deleteUser(created.user.id);
    return bad('ثبت پروفایل ناموفق: '+profileError.message+(cleanupError?'؛ حذف حساب ناقص هم ناموفق بود، بررسی دستی لازم است':''),500);
   }
   return NextResponse.json({message:`حساب ${name} ساخته و به تیم متصل شد. بازیکن می‌تواند با ایمیل و رمز وارد شود.`});
  }
  if(b.action==='start_next_game'){
    // The database function locks the current round and transfers balances atomically.
    const {data:weekId,error}=await db.rpc('start_next_game_v3');
    if(error)return bad('شروع بازی جدید ناموفق: '+error.message,409);
    return NextResponse.json({message:'بازی جدید با نقش‌ها و کلید تازه آغاز شد؛ موجودی هر دو تیم از صفر شروع می‌شود.',week_id:weekId});
  }
  if(b.action==='start_week'){
   const {data:active}=await db.from('weeks').select('id').eq('status','active').maybeSingle();if(active)return bad('هفته فعال از قبل وجود دارد');
   const {data:teams}=await db.from('teams').select('id');if(teams?.length!==2)return bad('دو تیم باید ثبت شده باشند');
   const {data:players}=await db.from('profiles').select('id,team_id').eq('is_admin',false);
   if(!players||players.length!==10||teams.some(t=>players.filter(p=>p.team_id===t.id).length!==5))return bad('هر تیم باید دقیقاً پنج بازیکن داشته باشد');
   const {data:week,error}=await db.from('weeks').insert({winning_key:randomInt(1,21)}).select('id').single();if(error||!week)return bad('شروع هفته ناموفق بود');
   const roles=['commander','thief','killer','guardian','spy'];
   for(const team of teams){const members=players.filter(p=>p.team_id===team.id);for(let i=members.length-1;i>0;i--){const j=randomInt(i+1);[members[i],members[j]]=[members[j],members[i]]}
    const {error:rolesError}=await db.from('assignments').insert(members.map((p,i)=>({week_id:week.id,user_id:p.id,role:roles[i]})));
    const {error:balanceError}=await db.from('team_balances').insert({week_id:week.id,team_id:team.id,balance:0});
    if(rolesError||balanceError)return bad('هفته ساخته شد اما راه‌اندازی کامل نشد؛ قبل از ادامه بررسی مدیر فنی لازم است',500);
   }
   return NextResponse.json({message:'هفته شروع شد و نقش‌ها قرعه‌کشی شدند.'});
  }
  if(b.action==='grant_coins'){
    const teamId=String(b.team_id||'');
    const amount=Number(b.coins);
    if(!Number.isSafeInteger(amount)||amount<=0||amount>2147483647)
      return bad('تعداد سکه باید عدد صحیح مثبت باشد');
    const {data:team,error:teamError}=await db.from('teams')
      .select('id').eq('id',teamId).maybeSingle();
    if(teamError||!team)return bad('تیم انتخاب‌شده معتبر نیست');
    const {data:balance,error}=await db.rpc('admin_grant_coins_unlimited_v3',{
      p_team:teamId,p_amount:amount,p_note:String(b.note||'').slice(0,300)
    });
    if(error)return bad('افزودن سکه ناموفق: '+error.message,409);
    return NextResponse.json({message:`${amount} سکه به خزانه تیم اضافه شد. موجودی جدید: ${balance} سکه.`});
  }
  if(b.action==='sale_one'){
   const {data:week}=await db.from('weeks').select('id,starts_on').eq('status','active').maybeSingle();if(!week)return bad('هفته فعالی وجود ندارد');
   const playerId=String(b.player_id||'');const {data:player}=await db.from('profiles').select('id,team_id,is_admin').eq('id',playerId).maybeSingle();
   if(!player||player.is_admin||!player.team_id)return bad('بازیکن معتبر نیست');
   const amount=Number(b.amount_million);if(!Number.isFinite(amount)||amount<0||amount>1000000||Math.round(amount*100)!==amount*100)return bad('مبلغ فروش نامعتبر است؛ به میلیون تومان و حداکثر دو رقم اعشار وارد کنید');
   
   // Backward-compatible with the older today/yesterday UI, but accepts
    // an explicit ISO day only within the active week and not in the future.
    const day = typeof b.sale_date === 'string' ? b.sale_date :
      b.day_choice === 'today' ? isoTehran(0) :
      b.day_choice === 'yesterday' ? isoTehran(-1) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
        !Number.isFinite(Date.parse(day + 'T00:00:00Z')) ||
        new Date(day + 'T00:00:00Z').toISOString().slice(0,10) !== day ||
        day < week.starts_on || day > isoTehran(0))
      return bad('تاریخ باید از شروع هفته فعال تا امروز باشد.');
    const {data:round,error:roundError}=await db.from('daily_rounds')
      .select('status').eq('week_id',week.id).eq('day',day).maybeSingle();
    if(roundError)return bad('بررسی وضعیت روز ناموفق: '+roundError.message,500);
    if(round?.status==='settled')return bad('این روز قبلاً تسویه شده؛ ثبت فروش جدید مجاز نیست');
   const {data,error}=await db.rpc('register_daily_sale_v2',{p_week:week.id,p_day:day,p_player:playerId,p_amount:amount,p_hit:!!b.target_hit,p_top:!!b.top_seller});
   if(error)return bad('ثبت فروش ناموفق: '+(error.code==='23505'?'فروش این بازیکن یا تاپ‌سلر آن روز قبلاً ثبت شده است':error.message));
   return NextResponse.json({message:`فروش ثبت شد و ${data} سکه به خزانه تیم اضافه شد. نتیجه عملیات در زمان مقرر اعلام می‌شود و تسویه روزهای گذشته خودکار است.`});
  }
  return bad('عملیات نامعتبر');
 }catch{return bad('خطای سرور',500)}
}

// Read-only daily sales summary for the admin panel.
export async function GET() {
  try {
    const auth=await serverDb();
    const {data:{user}}=await auth.auth.getUser();
    if(!user)return bad('ورود لازم است',401);
    const db=adminDb();
    const {data:me}=await db.from('profiles').select('is_admin').eq('id',user.id).maybeSingle();
    if(!me?.is_admin)return bad('فقط مدیر مجاز است',403);
    const {data:week,error:weekError}=await db.from('weeks').select('id,starts_on')
      .eq('status','active').maybeSingle();
    if(weekError)return bad(weekError.message,500);
    if(!week)return NextResponse.json({days:[],week_start:null});
    const today=isoTehran(0);
    const {data:sales,error:salesError}=await db.from('daily_sales')
      .select('day,player_id').eq('week_id',week.id).gte('day',week.starts_on).lte('day',today);
    if(salesError)return bad(salesError.message,500);
    const {data:rounds,error:roundError}=await db.from('daily_rounds')
      .select('day,status').eq('week_id',week.id);
    if(roundError)return bad(roundError.message,500);
    const {data:assignments,error:assignError}=await db.from('assignments')
      .select('user_id').eq('week_id',week.id);
    if(assignError)return bad(assignError.message,500);
    const expected=new Set((assignments??[]).map(a=>a.user_id));
    const days:{day:string,submitted:number,expected:number,round_status:string}[]=[];
    for(let day=week.starts_on;day<=today;){
      const submitted=new Set((sales??[]).filter(s=>s.day===day && expected.has(s.player_id)).map(s=>s.player_id));
      days.push({day,submitted:submitted.size,expected:expected.size,
        round_status:(rounds??[]).find(r=>r.day===day)?.status??'missing'});
      const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);day=d.toISOString().slice(0,10);
      if(days.length>14)break; // only the current game week; defensive cap
    }
    return NextResponse.json({week_start:week.starts_on,days});
  } catch {return bad('خطای سرور گزارش روزانه',500)}
}
