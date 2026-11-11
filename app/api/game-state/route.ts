import { NextResponse } from 'next/server';
import { serverDb } from '../../../lib/supabase';
import { adminDb } from '../../../lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const client = await serverDb();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });

    const db = adminDb();
    const { data: me } = await db.from('profiles')
      .select('id,is_admin,team_id').eq('id',user.id).maybeSingle();
    if (!me) return NextResponse.json({ error:'بازیکن معتبر نیست' }, { status: 403 });

    const { data: week } = await db.from('weeks')
      .select('id,starts_on,status').eq('status','active').maybeSingle();
    if (!week) return NextResponse.json({ game:null }, {
      headers: { 'Cache-Control':'private, no-store' }
    });

    const { data: victory, error } = await db.from('game_victories_v3')
      .select('team_id,won_at').eq('week_id',week.id).maybeSingle();
    if (error) {
      // Pre-migration route should still function on the staging branch.
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return NextResponse.json({ game:{status:'active',week_id:week.id,winner_team_id:null} });
      }
      throw error;
    }
    return NextResponse.json({
      game: {
        status: victory ? 'won' : 'active',
        week_id: week.id,
        winner_team_id: victory?.team_id ?? null,
        won_at: victory?.won_at ?? null,
      }
    }, { headers:{'Cache-Control':'private, no-store'} });
  } catch {
    return NextResponse.json({ error:'بارگذاری وضعیت بازی ناموفق بود' }, { status:500 });
  }
}
