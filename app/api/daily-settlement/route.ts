import { NextResponse } from 'next/server';
import { serverDb } from '../../../lib/supabase';
import { adminDb } from '../../../lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function tehranToday(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
async function context() {
  const client = await serverDb();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { error: 'ورود لازم است', status: 401 } as const;
  const db = adminDb();
  const { data: profile, error: profileError } = await db.from('profiles')
    .select('id,is_admin').eq('id', user.id).maybeSingle();
  if (profileError || !profile?.is_admin) return { error: 'فقط مدیر بازی مجاز است', status: 403 } as const;
  const { data: week, error: weekError } = await db.from('weeks')
    .select('id,starts_on').eq('status','active').maybeSingle();
  if (weekError || !week) return { error: 'هفته فعال یافت نشد', status: 400 } as const;
  return { db, week };
}
export async function GET() {
  try {
    const ctx = await context();
    if ('error' in ctx) return fail(ctx.error ?? 'خطای نامشخص', ctx.status);
    const { db, week } = ctx;
    const today = tehranToday();
    const { data: assignments, error: aErr } = await db.from('assignments').select('user_id').eq('week_id',week.id);
    const { data: sales, error: sErr } = await db.from('daily_sales').select('day,player_id').eq('week_id',week.id);
    const { data: rounds, error: rErr } = await db.from('daily_rounds').select('day,status').eq('week_id',week.id);
    const { data: operations, error: oErr } = await db.from('operations').select('day,status').eq('week_id',week.id);
    if (aErr || sErr || rErr || oErr) return fail('خطا در خواندن وضعیت روزها',500);
    const members = new Set((assignments ?? []).map(a=>a.user_id));
    const days = [];
    for (let day = week.starts_on as string; day <= today && days.length < 14;) {
      const submitted = new Set((sales??[]).filter(s=>s.day===day && members.has(s.player_id)).map(s=>s.player_id)).size;
      const pending = (operations??[]).filter(o=>o.day===day && o.status==='pending').length;
      days.push({
        day, submitted, expected: members.size, pending_operations: pending,
        round_status: (rounds??[]).find(r=>r.day===day)?.status ?? 'missing'
      });
      const d = new Date(`${day}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate()+1);
      day = d.toISOString().slice(0,10);
    }
    return NextResponse.json({week_id:week.id,days}, {headers:{'Cache-Control':'no-store'}});
  } catch {return fail('خطای سرور گزارش تسویه',500);}
}
export async function POST(req: Request) {
  try {
    const ctx = await context();
    if ('error' in ctx) return fail(ctx.error ?? 'خطای نامشخص', ctx.status);
    const {db,week} = ctx;
    const body = await req.json();
    const action = body?.action;
    const day = body?.day;
    if (typeof day !== 'string' || !datePattern.test(day) ||
        Number.isNaN(Date.parse(`${day}T12:00:00Z`)) ||
        day < week.starts_on || day > tehranToday()) return fail('تاریخ خارج از هفته فعال است');
    if (!['lock_day','resolve_day','settle_day'].includes(action)) return fail('عملیات نامعتبر');
    // Don't run financial settlement if any earlier day remains unsettled.
    if (action === 'settle_day') {
      const {data: earlier, error: earlierErr} = await db.from('daily_rounds')
        .select('day,status').eq('week_id',week.id).gte('day',week.starts_on).lt('day',day);
      if (earlierErr) return fail('بررسی روزهای قبل ناموفق بود',500);
      const existing = new Set((earlier??[]).filter(r=>r.status==='settled').map(r=>r.day));
      let date=week.starts_on as string;
      while (date < day) {
        if (!existing.has(date)) return fail(`ابتدا روز ${date} را تسویه کنید`);
        const t = new Date(`${date}T12:00:00Z`); t.setUTCDate(t.getUTCDate()+1);
        date=t.toISOString().slice(0,10);
      }
      const {data:check,error:checkErr} = await db.rpc('daily_settlement_preflight_v2',{p_week:week.id,p_day:day});
      if (checkErr) return fail('کنترل آمادگی ناموفق: '+checkErr.message);
      if (check?.ready_for_financial_settlement !== true)
        return fail('روز هنوز آماده تسویه نیست: '+JSON.stringify(check));
    }
    const fn = action==='lock_day'?'lock_daily_round_v2':
               action==='resolve_day'?'resolve_roles_and_consume_shields_v2':
               'settle_daily_combat_v2';
    const {data,error} = await db.rpc(fn,{p_week:week.id,p_day:day});
    if (error) return fail('عملیات انجام نشد: '+error.message);
    return NextResponse.json({message:action==='lock_day'?'روز قفل شد':action==='resolve_day'?'عملیات نقش‌ها پردازش شد':'تسویه روز ثبت شد',result:data});
  } catch {return fail('خطای سرور تسویه',500);}
}
