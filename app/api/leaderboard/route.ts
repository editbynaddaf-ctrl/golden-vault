import { NextResponse } from 'next/server';
import { serverDb } from '../../../lib/supabase';
import { adminDb } from '../../../lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });

type PlayerRow = {
  id: string;
  name: string;
  team_id: string;
  team_name: string;
  amount_million: number;
  base_coins: number;
  bonus_coins: number;
  earned_coins: number;
  team_rank: number;
};

export async function GET() {
  try {
    const auth = await serverDb();
    const { data: { user }, error: authError } = await auth.auth.getUser();
    if (authError || !user) return fail('ابتدا وارد حساب شوید', 401);

    const db = adminDb();
    const { data: me, error: profileError } = await db
      .from('profiles').select('id, team_id, is_admin')
      .eq('id', user.id).single();
    if (profileError || !me) return fail('حساب معتبر نیست', 403);

    const { data: week, error: weekError } = await db
      .from('weeks').select('id').eq('status', 'active').maybeSingle();
    if (weekError) return fail('خطا در دریافت هفته', 500);
    if (!week) return NextResponse.json({ week_id: null, self: null, players: [] });

    const { data: assignments, error: assignmentError } = await db
      .from('assignments').select('user_id').eq('week_id', week.id);
    if (assignmentError || !assignments) return fail('خطا در دریافت بازیکنان', 500);
    const ids = [...new Set(assignments.map(a => a.user_id))];
    if (!ids.length) return NextResponse.json({ week_id: week.id, self: null, players: [] });

    const { data: profiles, error: peopleError } = await db
      .from('profiles').select('id,name,team_id,is_admin')
      .in('id', ids);
    const { data: teams, error: teamsError } = await db
      .from('teams').select('id,name');
    const { data: sales, error: salesError } = await db
      .from('daily_sales')
      .select('player_id,amount_million,target_hit,top_seller')
      .eq('week_id', week.id);

    if (peopleError || teamsError || salesError || !profiles || !teams || !sales)
      return fail('خطا در محاسبه رتبه‌بندی', 500);

    const nameByTeam = new Map(teams.map(t => [t.id, t.name]));
    const rows: PlayerRow[] = profiles
      .filter(p => !p.is_admin && p.team_id)
      .map(p => {
        const mine = sales.filter(s => s.player_id === p.id);
        const amount = mine.reduce((sum, s) => sum + Number(s.amount_million), 0);
        // One floor per sale/day, matching register_daily_sale_v2.
        const base = mine.reduce((sum, s) => sum + Math.floor(Number(s.amount_million)), 0);
        const bonus = mine.reduce(
          (sum, s) => sum + (s.target_hit ? 5 : 0) + (s.top_seller ? 10 : 0), 0);
        return {
          id: p.id, name: p.name, team_id: p.team_id as string,
          team_name: nameByTeam.get(p.team_id as string) ?? 'تیم',
          amount_million: amount, base_coins: base, bonus_coins: bonus,
          earned_coins: base + bonus, team_rank: 0,
        };
      });

    // Stable competition ranking: 1, 1, 3 for ties.
    for (const team of teams) {
      const members = rows.filter(p => p.team_id === team.id)
        .sort((a,b) => b.earned_coins - a.earned_coins
          || b.amount_million - a.amount_million
          || a.name.localeCompare(b.name, 'fa'));
      members.forEach((p, index) => {
        p.team_rank = 1 + members.filter(other => other.earned_coins > p.earned_coins).length;
      });
    }

    if (!me.is_admin && !ids.includes(user.id))
      return fail('شما عضو هفته فعال نیستید', 403);

    const self = rows.find(p => p.id === user.id) ?? null;
    return NextResponse.json({
      week_id: week.id,
      self,
      players: me.is_admin
        ? rows.sort((a,b) => a.team_name.localeCompare(b.team_name, 'fa')
            || a.team_rank - b.team_rank || a.name.localeCompare(b.name, 'fa'))
        : [],
      metric: 'gross_sales_earned',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return fail('خطای سرور رتبه‌بندی', 500);
  }
}
