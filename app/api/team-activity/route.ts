import { NextResponse } from 'next/server';
import { serverDb } from '../../../lib/supabase';
import { adminDb } from '../../../lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noCache = { 'Cache-Control': 'private, no-store' };

function tehranTime() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tehran',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

function safeOutcome(result: string | null): string | null {
  if (!result) return null;
  try {
    const value: unknown = JSON.parse(result);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const outcome = (value as Record<string, unknown>).outcome;
    // Never send internal metadata, private winning keys, or spy results in this feed.
    return typeof outcome === 'string' ? outcome : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const client = await serverDb();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401, headers: noCache });

    const db = adminDb();
    const { data: me } = await db.from('profiles')
      .select('id,team_id,is_admin').eq('id', user.id).maybeSingle();
    if (!me?.team_id || me.is_admin) {
      return NextResponse.json({ error: 'بازیکن معتبر نیست' }, { status: 403, headers: noCache });
    }
    const { data: week } = await db.from('weeks')
      .select('id').eq('status', 'active').maybeSingle();
    if (!week) return NextResponse.json({ items: [] }, { headers: noCache });

    const { data: players, error: playersErr } = await db.from('profiles')
      .select('id,name,team_id').eq('is_admin', false);
    if (playersErr) throw playersErr;
    const people = new Map((players ?? []).map(p => [p.id, p]));
    const allyIds = (players ?? []).filter(p => p.team_id === me.team_id).map(p => p.id);

    const { data: ops, error: opsErr } = await db.from('operations')
      .select('id,actor_id,target_id,kind,day,status,result,created_at,resolved_at')
      .eq('week_id', week.id)
      .order('created_at', { ascending: false }).limit(200);
    if (opsErr) throw opsErr;

    const { day: today, hour } = tehranTime();
    const items = (ops ?? []).flatMap(op => {
      const ownTeam = allyIds.includes(op.actor_id);
      const ownTarget = op.target_id === user.id;
      if (!ownTeam && !ownTarget) return [];

      // Team sees the actor, action and exact intended target immediately.
      // Other-team players only see operations targeting themselves after 18:00.
      if (!ownTeam && !(op.day < today || (op.day === today && hour >= 18))) return [];

      const actor = op.actor_id === user.id;
      // The actor receives the result at 12:00, the target at 18:00.
      // Other allies can inspect the operation immediately, but not its outcome until 18:00.
      const showOutcome = op.status === 'resolved' &&
        (actor
          ? (op.day < today || (op.day === today && hour >= 12))
          : (op.day < today || (op.day === today && hour >= 18)));

      return [{
        id: op.id,
        day: op.day,
        kind: op.kind,
        actor: ownTeam ? people.get(op.actor_id)?.name ?? 'بازیکن' : 'بازیکن حریف',
        target: op.target_id ? people.get(op.target_id)?.name ?? 'بازیکن' : null,
        actor_team: ownTeam,
        created_at: op.created_at,
        status: showOutcome ? op.status : 'hidden',
        outcome: showOutcome ? safeOutcome(op.result) : null,
      }];
    });

    return NextResponse.json({ items, tehran_time: { day: today, hour } }, { headers: noCache });
  } catch {
    return NextResponse.json({ error: 'دریافت گزارش عملیات ناموفق بود' },
      { status: 500, headers: noCache });
  }
}
