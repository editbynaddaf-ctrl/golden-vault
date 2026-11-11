import { NextResponse } from 'next/server';
import { serverDb } from '../../../lib/supabase';
import { adminDb } from '../../../lib/admin';

export const runtime = 'nodejs';
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

function tehranNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const p = (type: string) => parts.find(x => x.type === type)?.value ?? '';
  return { day: `${p('year')}-${p('month')}-${p('day')}`, hour: Number(p('hour')), minute: Number(p('minute')) };
}

const roleByAction: Record<string, string> = {
  thief: 'thief', killer: 'killer', guardian: 'guardian',
  spy_role: 'spy', spy_key: 'spy', spy_shop: 'spy',
  attack: 'commander', golden_day: 'commander',
};
const weeklyLimit: Record<string, number> = {
  thief: 5, killer: 3, spy_role: 3, spy_key: 1,
  spy_shop: 1, attack: 1, golden_day: 1,
};

export async function POST(req: Request) {
  try {
    const auth = await serverDb();
    const { data: { user }, error: authError } = await auth.auth.getUser();
    if (authError || !user) return fail('ابتدا وارد شوید', 401);
    const db = adminDb();
    const { data: me } = await db.from('profiles')
      .select('id,team_id,is_admin').eq('id', user.id).maybeSingle();
    if (!me || !me.team_id || me.is_admin) return fail('بازیکن معتبر نیست', 403);
    const { data: week } = await db.from('weeks')
      .select('id,starts_on').eq('status', 'active').maybeSingle();
    if (!week) return fail('هفته فعال نیست');
    const { data: assignment } = await db.from('assignments')
      .select('role').eq('week_id', week.id).eq('user_id', user.id).maybeSingle();
    if (!assignment) return fail('نقش شما مشخص نیست', 403);

    const { data: won, error: victoryErr } = await db.from('game_victories_v3')
      .select('week_id').eq('week_id', week.id).maybeSingle();
    if (victoryErr && !['42P01','PGRST205'].includes(victoryErr.code)) {
      return fail('بررسی وضعیت صندوق ناموفق بود', 500);
    }
    if (won) return fail('بازی پایان یافته و صندوق باز شده است', 409);

    const body = await req.json();
    const action = String(body.action ?? '');
    const role = assignment.role;
    const time = tehranNow();
    if (time.day < week.starts_on) return fail('این دوره هنوز شروع نشده');

    // Legacy commander key purchases remain separate and use the existing atomic RPC.
    if (action === 'test_key' || action === 'eliminate_key') {
      if (role !== 'commander') return fail('فقط فرمانده مجاز است', 403);
      let key = Number(body.key);
      if (action === 'eliminate_key') {
        const { data: checks } = await db.from('key_checks')
          .select('key_number').eq('week_id', week.id).eq('team_id', me.team_id);
        const { data: w } = await db.from('weeks').select('winning_key').eq('id',week.id).single();
        if (!w) return fail('اطلاعات صندوق پیدا نشد', 500);
        const excluded = new Set((checks ?? []).map(x => x.key_number));
        const candidates = Array.from({length:20}, (_, i) => i+1)
          .filter(k => k !== w.winning_key && !excluded.has(k));
        if (!candidates.length) return fail('کلید اشتباه دیگری باقی نمانده');
        key = candidates[Math.floor(Math.random()*candidates.length)];
      }
      if (!Number.isInteger(key) || key < 1 || key > 20) return fail('شماره کلید نامعتبر');
      const { data, error } = await db.rpc('purchase_key', {
        p_week: week.id, p_team: me.team_id, p_key: key,
        p_kind: action === 'test_key' ? 'test' : 'eliminate',
        p_cost: action === 'test_key' ? 50 : 30,
      });
      if (error) return fail('عملیات کلید ناموفق: ' + error.message);
      return NextResponse.json({ message: `کلید ${key}: ${data === 'correct' ? 'درست است' : 'اشتباه است'}` });
    }

    if (roleByAction[action] !== role) return fail('به این قدرت دسترسی ندارید', 403);
    const isSpy = action.startsWith('spy_');
if (time.hour >= 10) return fail('مهلت ثبت عملیات امروز تمام شده است');
    const { data: previous, error: historyError } = await db.from('operations')
      .select('id,day,kind').eq('week_id', week.id).eq('actor_id', user.id)
      .eq('kind', action);
    if (historyError) return fail('خطا در بررسی سهمیه', 500);
    if (weeklyLimit[action] && (previous?.length ?? 0) >= weeklyLimit[action])
      return fail('سهمیه هفتگی این قدرت تمام شده است');
    if ((action === 'thief' || action === 'killer' || action === 'guardian' || action === 'spy_role')
       && previous?.some(p => p.day === time.day))
      return fail('این قدرت امروز قبلاً استفاده شده است');

    if (action === 'attack' || action === 'golden_day') {
      const opposite = action === 'attack' ? 'golden_day' : 'attack';
      const { data: other } = await db.from('operations').select('id')
        .eq('week_id', week.id).eq('actor_id', user.id)
        .eq('kind', opposite).eq('day', time.day).limit(1);
      if (other?.length) return fail('فرمان حمله و روز طلایی در یک روز مجاز نیستند');
    }

    let target: string | null = null;
    if (['thief','killer','guardian','spy_role'].includes(action)) {
      target = String(body.target_id ?? '');
      const { data: person } = await db.from('profiles')
        .select('team_id,is_admin').eq('id', target).maybeSingle();
      if (!person || person.is_admin || (action === 'guardian'
          ? person.team_id !== me.team_id || target === user.id
          : person.team_id === me.team_id)) return fail('هدف انتخاب‌شده معتبر نیست');
    }

    // Spy investigations are immediate, confidential, and not blocked by guardians.
    if (isSpy) {
      let message: string;
      let result: Record<string, unknown> = {};
      if (action === 'spy_role') {
        const { data: targetRole } = await db.from('assignments').select('role')
          .eq('week_id', week.id).eq('user_id', target!).maybeSingle();
        if (!targetRole) return fail('نقش هدف پیدا نشد');
        result = { role: targetRole.role };
        const labels: Record<string,string> = { commander:'فرمانده',thief:'سارق',killer:'قاتل',guardian:'محافظ',spy:'جاسوس' };
        message = `نقش هدف: ${labels[targetRole.role] ?? targetRole.role}`;
      } else if (action === 'spy_key') {
        const { data: opponentTeam } = await db.from('teams').select('id')
          .neq('id', me.team_id).limit(1).maybeSingle();
        if (!opponentTeam) return fail('تیم حریف پیدا نشد');
        const { data: found } = await db.from('key_checks').select('key_number')
          .eq('week_id',week.id).eq('team_id',opponentTeam.id).eq('result','correct').limit(1);
        result = { found: Boolean(found?.length) };
        message = found?.length ? 'تیم حریف کلید اصلی را یافته است' : 'تیم حریف هنوز کلید اصلی را نیافته است';
      } else {
        const { data: purchases, error: equipmentError } = await db.from('team_equipment')
          .select('code').neq('team_id',me.team_id);
        if (equipmentError) return fail('خطا در بررسی خریدهای حریف',500);
        const counts: Record<string, number> = {};
        for (const p of purchases ?? []) counts[p.code] = (counts[p.code] ?? 0) + 1;
        result = { equipment: counts };
        message = Object.keys(counts).length
          ? `خریدهای حریف: ${Object.entries(counts).map(([name,count])=>`${name} ×${count}`).join('، ')}`
          : 'تیم حریف هنوز تجهیزی نخریده است';
      }
      const { error: insertError } = await db.from('operations').insert({
        week_id:week.id,actor_id:user.id,target_id:target,kind:action,
        day:time.day,status:'resolved',result:JSON.stringify(result),resolved_at:new Date().toISOString(),
      });
      if (insertError) return fail('ثبت استعلام ناموفق: '+insertError.message);
      return NextResponse.json({
        message: 'استعلام ثبت شد. نتیجه محرمانه از ساعت ۱۲ امروز در گزارش عملیات نمایش داده می‌شود.',
        confidential: true
      });
    }

    const { error } = await db.from('operations').insert({
      week_id: week.id, actor_id:user.id,target_id:target,kind:action,
      day:time.day,status:'pending',
    });
    if (error) return fail('ثبت عملیات ناموفق: '+error.message);
    return NextResponse.json({ message:'دستور محرمانه ثبت شد و ساعت ۱۰ صبح ایران همراه سایر دستورات بررسی می‌شود.' });
  } catch {
    return fail('خطای سرور',500);
  }
}
