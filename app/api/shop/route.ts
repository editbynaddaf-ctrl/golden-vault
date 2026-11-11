
import { NextResponse } from 'next/server';
import { serverDb } from '../../../lib/supabase';
import { adminDb } from '../../../lib/admin';

export const runtime = 'nodejs';

const fail = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });

const allowedEquipment = [
  'team_shield',
  'key_duel',
  'three_key_scanner',
  'parity_oracle',
];

export async function POST(req: Request) {
  try {
    const client = await serverDb();

    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();

    if (authError || !user) {
      return fail('ابتدا وارد حساب خود شوید', 401);
    }

    const db = adminDb();

    const { data: me, error: profileError } = await db
      .from('profiles')
      .select('id, team_id, is_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !me || me.is_admin || !me.team_id) {
      return fail('بازیکن معتبر نیست', 403);
    }

    const { data: week, error: weekError } = await db
      .from('weeks')
      .select('id')
      .eq('status', 'active')
      .single();

    if (weekError || !week) {
      return fail('هفته فعالی وجود ندارد');
    }

    const { data: assignment, error: roleError } = await db
      .from('assignments')
      .select('role')
      .eq('week_id', week.id)
      .eq('user_id', user.id)
      .single();

    if (
      roleError ||
      !assignment ||
      assignment.role !== 'commander'
    ) {
      return fail('فقط فرمانده اجازه خرید تجهیزات دارد', 403);
    }

    const { data: victory, error: victoryErr } = await db.from('game_victories_v3')
      .select('week_id').eq('week_id', week.id).maybeSingle();
    if (victoryErr && !['42P01', 'PGRST205'].includes(victoryErr.code)) {
      return fail('بررسی وضعیت بازی ناموفق بود', 500);
    }
    if (victory) return fail('بازی پایان یافته است؛ خرید و فعال‌سازی تجهیزات بسته شده', 409);

    const body = await req.json();

if (body?.action === 'activate_shield') {
  const equipmentId = body?.equipment_id;

  if (
    typeof equipmentId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(equipmentId)
  ) {
    return fail('شناسه سپر معتبر نیست');
  }

  const { data: activationDay, error: activationError } =
    await db.rpc('schedule_team_shield_v2', {
      p_week: week.id,
      p_actor: user.id,
      p_equipment_id: equipmentId,
    });

  if (activationError) {
    return fail('فعال‌سازی ناموفق: ' + activationError.message);
  }

  return NextResponse.json({
    message: `سپر تیم برای ${activationDay} فعال شد.`,
    activation_day: activationDay,
  });
}

if (body?.action === 'activate_key_intel') {
      const equipmentId = body?.equipment_id;
      const keys = body?.keys;
      if (typeof equipmentId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(equipmentId)) {
        return fail('شناسه تجهیز معتبر نیست');
      }
      if (!Array.isArray(keys) || keys.length > 3 ||
          !keys.every((n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 20) ||
          new Set(keys).size !== keys.length) {
        return fail('شماره کلیدها باید معتبر و متفاوت باشند');
      }

      const { data, error } = await db.rpc('activate_key_intel_equipment_v2', {
        p_week: week.id,
        p_actor: user.id,
        p_equipment_id: equipmentId,
        p_keys: keys,
      });
      if (error) return fail('فعال‌سازی ناموفق: ' + error.message);
      return NextResponse.json({ message: 'تجهیز فعال شد.', result: data?.result ?? null });
    }

    if (body?.action !== 'buy_equipment') {
      return fail('عملیات فروشگاه نامعتبر است');
    }

    const code = body?.code;

    if (
      typeof code !== 'string' ||
      !allowedEquipment.includes(code)
    ) {
      return fail('تجهیز انتخاب‌شده معتبر نیست');
    }

    // Purchase is available 24 hours a day.
    // The database function checks spendable coins
    // and prevents duplicate purchases.
    const { data: equipmentId, error: purchaseError } =
      await db.rpc('purchase_equipment_v2', {
        p_week: week.id,
        p_team: me.team_id,
        p_commander: user.id,
        p_code: code,
      });

    if (purchaseError) {
      return fail('خرید ناموفق: ' + purchaseError.message);
    }

    return NextResponse.json({
      message: 'تجهیز با موفقیت خریداری و به انبار تیم اضافه شد.',
      equipment_id: equipmentId,
    });
  } catch {
    return fail('خطای سرور فروشگاه', 500);
  }
}

export async function GET() {
  try {
    const client = await serverDb();

    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();

    if (authError || !user) {
      return fail('ابتدا وارد شوید', 401);
    }

    const db = adminDb();

    const { data: me, error: profileError } = await db
      .from('profiles')
      .select('team_id, is_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !me || me.is_admin || !me.team_id) {
      return fail('بازیکن معتبر نیست', 403);
    }

    // Private key intelligence must never be returned to another player.
    const { data: week } = await db.from('weeks').select('id')
      .eq('status', 'active').maybeSingle();
    let isCommander = false;
    if (week) {
      const { data: assignment } = await db.from('assignments').select('role')
        .eq('week_id', week.id).eq('user_id', user.id).maybeSingle();
      isCommander = assignment?.role === 'commander';
    }
    if (!isCommander) return fail('انبار اطلاعاتی فقط برای فرمانده قابل مشاهده است', 403);

    const { data: equipment, error } = await db
      .from('team_equipment')
      .select(
        'id, code, status, purchased_at, activation_day, used_at, result_private'
      )
      .eq('team_id', me.team_id)
      .order('purchased_at', { ascending: false });

    if (error) {
      return fail('خطا در دریافت انبار تجهیزات', 500);
    }

    return NextResponse.json({
      equipment: equipment ?? [],
    });
  } catch {
    return fail('خطای سرور انبار', 500);
  }
}

