import { NextResponse } from 'next/server';
import { serverDb } from '../../../lib/supabase';
import { adminDb } from '../../../lib/admin';

export const runtime = 'nodejs';
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function context() {
  const client = await serverDb();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { error: 'ابتدا وارد شوید', status: 401 } as const;
  const db = adminDb();
  const { data: profile } = await db.from('profiles').select('id, team_id, is_admin')
    .eq('id', user.id).maybeSingle();
  if (!profile) return { error: 'حساب معتبر نیست', status: 403 } as const;
  const { data: week } = await db.from('weeks').select('id, starts_on')
    .eq('status', 'active').maybeSingle();
  if (!week) return { error: 'هفته فعالی وجود ندارد', status: 400 } as const;
  const { data: assignment } = await db.from('assignments').select('role')
    .eq('week_id', week.id).eq('user_id', user.id).maybeSingle();
  if (!profile.is_admin && !assignment) return { error: 'در این هفته بازیکن نیستید', status: 403 } as const;
  return { db, week, user, profile, role: assignment?.role ?? null };
}

export async function GET() {
  try {
    const ctx = await context();
    if ('error' in ctx) return fail(ctx.error ?? 'خطای نامشخص', ctx.status);
    const { db, week, profile } = ctx;
    const { data: final, error } = await db.from('vault_finals_v2')
      .select('week_id, first_team_id, status, winner_team_id, opened_at, closed_at')
      .eq('week_id', week.id).maybeSingle();
    if (error) return fail('خطا در خواندن فینال: ' + error.message, 500);
    const { data: attempts, error: ae } = await db.from('vault_attempts')
      .select('team_id, attempt_number, success')
      .eq('week_id', week.id).order('created_at', { ascending: true });
    if (ae) return fail('خطا در خواندن تلاش‌ها: ' + ae.message, 500);
    const counts: Record<string, number> = {};
    for (const a of attempts ?? []) counts[a.team_id] = (counts[a.team_id] ?? 0) + 1;
    const { data: teams } = await db.from('assignments').select('user_id, profiles(team_id)')
      .eq('week_id', week.id);
    // Prefer the two known team IDs from assigned profiles; do not reveal hidden keys.
    const teamIds = Array.from(new Set((teams ?? []).map((x: any) => {
      const p = Array.isArray(x.profiles) ? x.profiles[0] : x.profiles;
      return p?.team_id as string | undefined;
    }).filter((id): id is string => Boolean(id))));
    const otherTeam = final ? teamIds.find(id => id !== final.first_team_id) : null;
    const nextTeamId = final?.status === 'open'
      ? ((attempts?.length ?? 0) % 2 === 0 ? final.first_team_id : otherTeam ?? null)
      : null;
    let sales: Array<{ team_id: string; amount_million: number }> | undefined;
    if (profile.is_admin) {
      const { data: rows, error: se } = await db.from('daily_sales')
        .select('player_id, amount_million, day').eq('week_id', week.id);
      if (se) return fail('خطا در خواندن فروش: ' + se.message, 500);
      const { data: ps } = await db.from('profiles').select('id, team_id').in('id', (rows ?? []).map(r => r.player_id));
      const lookup = new Map((ps ?? []).map(p => [p.id, p.team_id]));
      const start = new Date(week.starts_on + 'T00:00:00Z');
      const offset = (4 - ((start.getUTCDay() + 6) % 7 + 1) + 7) % 7;
      const thursday = new Date(start.getTime() + offset * 86400000).toISOString().slice(0, 10);
      const totals: Record<string, number> = {};
      for (const r of rows ?? []) {
        if (r.day < week.starts_on || r.day > thursday) continue;
        const team = lookup.get(r.player_id);
        if (team) totals[team] = (totals[team] ?? 0) + Number(r.amount_million);
      }
      sales = teamIds.map(team_id => ({ team_id, amount_million: totals[team_id] ?? 0 }));
    }
    return NextResponse.json({ final, counts, total_attempts: attempts?.length ?? 0,
      next_team_id: nextTeamId, sales });
  } catch {
    return fail('خطای سرور فینال', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await context();
    if ('error' in ctx) return fail(ctx.error ?? 'خطای نامشخص', ctx.status);
    const { db, week, user, profile, role } = ctx;
    const body = await req.json().catch(() => null);
    if (body?.action === 'open_final') {
      if (!profile.is_admin) return fail('فقط مدیر می‌تواند فینال را شروع کند', 403);
      const { data, error } = await db.rpc('open_vault_final_v2', { p_week: week.id });
      if (error) return fail('شروع فینال ناموفق: ' + error.message);
      return NextResponse.json({ message: 'وضعیت مراسم ثبت شد', result: data });
    }
    if (body?.action === 'attempt_key') {
      if (profile.is_admin || role !== 'commander' || !profile.team_id)
        return fail('فقط فرمانده اجازه ثبت تلاش دارد', 403);
      const key = body.key_number;
      if (!Number.isInteger(key) || key < 1 || key > 20)
        return fail('شماره کلید باید بین ۱ و ۲۰ باشد');
      const { data, error } = await db.rpc('attempt_vault_final_v2', {
        p_week: week.id, p_actor: user.id, p_key: key,
      });
      if (error) return fail('تلاش ناموفق: ' + error.message);
      return NextResponse.json({ message: data?.success ? 'صندوق باز شد! 🏆' : 'نتیجه تلاش ثبت شد', result: data });
    }
    return fail('عملیات فینال نامعتبر است');
  } catch {
    return fail('خطای سرور فینال', 500);
  }
}
