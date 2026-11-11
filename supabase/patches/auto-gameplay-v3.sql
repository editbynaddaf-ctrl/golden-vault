-- GOLDEN VAULT V3: AUTO GAMEPLAY (STAGING ONLY)
-- Apply only once UI/API are deployed. Does not mutate existing player sales or coins.
-- Existing balances are kept; future role debits may create a negative balance (debt).
BEGIN;

CREATE TABLE IF NOT EXISTS public.game_victories_v3 (
  week_id uuid PRIMARY KEY REFERENCES public.weeks(id),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  key_number integer NOT NULL CHECK (key_number BETWEEN 1 AND 20),
  won_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.game_victories_v3 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.game_victories_v3 FROM PUBLIC, anon, authenticated;

-- Permit future financial clawbacks without double-spending or losing an owed debit:
-- teams with negative balances cannot make another purchase until new sales repay debt.
ALTER TABLE public.team_balances DROP CONSTRAINT IF EXISTS team_balances_balance_check;

CREATE OR REPLACE VIEW public.team_spendable_preview_v2 AS
SELECT b.week_id, b.team_id, b.balance AS total_balance,
       0::bigint AS reserved_base_coins,
       GREATEST(b.balance::bigint, 0::bigint) AS spendable_coins,
       (b.balance < 0) AS reserve_shortfall
FROM public.team_balances b;


CREATE OR REPLACE FUNCTION public.apply_coin_settlement_v2(p_week uuid, p_team uuid, p_day date, p_delta integer, p_settlement_key text, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_balance integer;
  v_new_balance integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role only';
  END IF;

  IF p_week IS NULL OR p_team IS NULL OR p_day IS NULL OR p_delta IS NULL
     OR p_settlement_key IS NULL OR length(btrim(p_settlement_key)) < 8
     OR length(p_settlement_key) > 240
     OR p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'invalid settlement arguments';
  END IF;

  -- Every settlement takes a week-level lock first. This makes concurrent
  -- adjustments to any team for the same week run sequentially.
  PERFORM 1 FROM public.weeks
  WHERE id = p_week AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active week not found';
  END IF;

  -- Idempotency guard: no new balance movement for repeated settlement keys.
  IF EXISTS (
    SELECT 1 FROM public.coin_ledger WHERE settlement_key = p_settlement_key
  ) THEN
    RETURN false;
  END IF;

  SELECT balance INTO v_balance
  FROM public.team_balances
  WHERE week_id = p_week AND team_id = p_team
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'team balance not found';
  END IF;

  IF (v_balance::bigint + p_delta::bigint) > 2147483647 THEN
    RAISE EXCEPTION 'settlement would overflow balance';
  END IF;

  v_new_balance := v_balance + p_delta;

  UPDATE public.team_balances
  SET balance = v_new_balance
  WHERE week_id = p_week AND team_id = p_team;

  INSERT INTO public.coin_ledger(
    week_id, team_id, delta, day, reason,
    balance_after, source_type, settlement_key
  ) VALUES (
    p_week, p_team, p_delta, p_day, p_reason,
    v_new_balance, 'daily_settlement', p_settlement_key
  );

  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.purchase_key(p_week uuid, p_team uuid, p_key integer, p_kind text, p_cost integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_winning_key integer;
  v_balance integer;
  v_reserved bigint;
  v_result text;
BEGIN
  -- This function is called by the trusted backend using the service-role key.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role only';
  END IF;

  IF p_week IS NULL OR p_team IS NULL OR p_key IS NULL
     OR p_key NOT BETWEEN 1 AND 20
     OR NOT ((p_kind = 'test' AND p_cost = 50)
             OR (p_kind = 'eliminate' AND p_cost = 30)) THEN
    RAISE EXCEPTION 'invalid purchase';
  END IF;

  -- Serialize competing key purchases for the same week.
  SELECT winning_key INTO v_winning_key
  FROM public.weeks
  WHERE id = p_week AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active week';
  END IF;

  IF EXISTS (SELECT 1 FROM public.game_victories_v3 WHERE week_id=p_week) THEN
    RAISE EXCEPTION 'game already won';
  END IF;

  -- Also lock the team's balance. Sale credit writes to this row, ensuring
  -- the reserve check sees a consistent committed balance / sales snapshot.
  SELECT balance INTO v_balance
  FROM public.team_balances
  WHERE week_id = p_week AND team_id = p_team
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'team balance not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.key_checks
    WHERE week_id = p_week AND team_id = p_team AND key_number = p_key
  ) THEN
    RAISE EXCEPTION 'key already checked';
  END IF;
  IF p_kind = 'eliminate' AND p_key = v_winning_key THEN
    RAISE EXCEPTION 'cannot eliminate winning key';
  END IF;

  SELECT reserved_base_coins INTO v_reserved
  FROM public.team_spendable_preview_v2
  WHERE week_id = p_week AND team_id = p_team;

  IF v_reserved IS NULL THEN
    RAISE EXCEPTION 'spendable balance unavailable';
  END IF;
  IF v_balance::bigint - v_reserved < p_cost THEN
    RAISE EXCEPTION 'insufficient spendable coins (reserved sales cannot be spent)';
  END IF;

  UPDATE public.team_balances
  SET balance = balance - p_cost
  WHERE week_id = p_week AND team_id = p_team;

  v_result := CASE WHEN p_key = v_winning_key THEN 'correct' ELSE 'wrong' END;
  INSERT INTO public.key_checks(week_id, team_id, key_number, kind, result)
  VALUES (p_week, p_team, p_key, p_kind, v_result);

  INSERT INTO public.coin_ledger(week_id, team_id, delta, reason)
  VALUES (p_week, p_team, -p_cost, p_kind || ' key ' || p_key);

  IF v_result = 'correct' AND p_kind = 'test' THEN
    INSERT INTO public.game_victories_v3(week_id,team_id,key_number)
    VALUES(p_week,p_team,p_key);
    INSERT INTO public.audit_events(week_id,day,team_id,category,summary,details)
    VALUES(p_week,(now() AT TIME ZONE 'Asia/Tehran')::date,p_team,
      'game_victory','تیم برنده صندوق را باز کرد',
      jsonb_build_object('winning_team_id',p_team,'key_number',p_key));
  END IF;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.purchase_equipment_v2(p_week uuid, p_team uuid, p_commander uuid, p_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cost integer;
  v_balance integer;
  v_reserved bigint;
  v_id uuid;
  v_day date := (now() AT TIME ZONE 'Asia/Tehran')::date;
  v_starts_on date;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service role only';
  END IF;

  IF p_week IS NULL OR p_team IS NULL OR p_commander IS NULL OR p_code IS NULL THEN
    RAISE EXCEPTION 'missing purchase parameters';
  END IF;

  -- Lock the active week, then the team wallet, to serialize with key purchases.
  SELECT starts_on INTO v_starts_on
  FROM public.weeks
  WHERE id = p_week AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active week required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.game_victories_v3 WHERE week_id=p_week) THEN
    RAISE EXCEPTION 'game already won';
  END IF;
  IF v_day < v_starts_on THEN
    RAISE EXCEPTION 'week has not started';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.assignments a
    JOIN public.profiles p ON p.id = a.user_id
    WHERE a.week_id = p_week AND a.user_id = p_commander
      AND a.role = 'commander' AND p.team_id = p_team
      AND p.is_admin = false
  ) THEN
    RAISE EXCEPTION 'commander only';
  END IF;

  SELECT price INTO v_cost
  FROM public.equipment_catalog
  WHERE code = p_code AND enabled = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown equipment';
  END IF;

  SELECT balance INTO v_balance
  FROM public.team_balances
  WHERE week_id = p_week AND team_id = p_team
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'team not in active week';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.team_equipment
    WHERE purchased_week_id = p_week AND team_id = p_team AND code = p_code
  ) THEN
    RAISE EXCEPTION 'already purchased this week';
  END IF;

  SELECT reserved_base_coins INTO v_reserved
  FROM public.team_spendable_preview_v2
  WHERE week_id = p_week AND team_id = p_team;
  IF v_reserved IS NULL THEN
    RAISE EXCEPTION 'spendable coins unavailable';
  END IF;
  IF v_balance::bigint - v_reserved < v_cost THEN
    RAISE EXCEPTION 'insufficient spendable coins (reserved sales cannot be spent)';
  END IF;

  UPDATE public.team_balances
  SET balance = balance - v_cost
  WHERE week_id = p_week AND team_id = p_team;

  -- Keep existing column defaults and the same return shape as the old function.
  INSERT INTO public.team_equipment(team_id, purchased_week_id, code, purchased_by)
  VALUES (p_team, p_week, p_code, p_commander)
  RETURNING id INTO v_id;

  INSERT INTO public.coin_ledger(
    week_id, team_id, delta, reason, day, actor_id, balance_after, source_type
  ) VALUES (
    p_week, p_team, -v_cost, 'equipment purchase: ' || p_code, v_day,
    p_commander, v_balance - v_cost, 'shop_purchase'
  );

  INSERT INTO public.audit_events(
    week_id, day, actor_id, team_id, category, summary, details
  ) VALUES (
    p_week, v_day, p_commander, p_team, 'shop_purchase', 'خرید تجهیز',
    jsonb_build_object('equipment', p_code, 'cost', v_cost, 'inventory_id', v_id)
  );

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.register_daily_sale_v2(p_week uuid, p_day date, p_player uuid, p_amount numeric, p_hit boolean, p_top boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_team uuid;
  v_coins integer;
  v_start date;
  v_today date := (now() AT TIME ZONE 'Asia/Tehran')::date;
  v_status text;
  v_existing boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role only';
  END IF;

  IF p_week IS NULL OR p_day IS NULL OR p_player IS NULL THEN
    RAISE EXCEPTION 'week, day and player required';
  END IF;

  -- Shared lock serializes sales registration against settlement and final opening.
  SELECT starts_on INTO v_start
  FROM public.weeks
  WHERE id = p_week AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inactive week';
  END IF;

  IF EXISTS (SELECT 1 FROM public.game_victories_v3 WHERE week_id=p_week) THEN
    RAISE EXCEPTION 'game already won';
  END IF;

  -- Keep original allowance for a sale entered on the day immediately before the
  -- active week's starts_on, to preserve existing administrative behavior.
  IF p_day > v_today OR p_day < v_start - 1 THEN
    RAISE EXCEPTION 'invalid day';
  END IF;

  IF p_amount IS NULL OR p_amount < 0 OR p_amount > 1000000
     OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'invalid amount';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.vault_finals_v2 WHERE week_id = p_week
  ) THEN
    RAISE EXCEPTION 'final has started: sales cannot be changed';
  END IF;

  SELECT status INTO v_status
  FROM public.daily_rounds
  WHERE week_id = p_week AND day = p_day
  FOR UPDATE;
  IF v_status = 'settled' THEN
    RAISE EXCEPTION 'day already settled: late sales are not allowed';
  END IF;

  SELECT p.team_id INTO v_team
  FROM public.assignments a
  JOIN public.profiles p ON p.id = a.user_id
  WHERE a.week_id = p_week AND a.user_id = p_player
    AND p.is_admin = false AND p.team_id IS NOT NULL;
  IF v_team IS NULL THEN
    RAISE EXCEPTION 'player is not assigned to this active week';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.team_balances
    WHERE week_id = p_week AND team_id = v_team
  ) THEN
    RAISE EXCEPTION 'team not enrolled';
  END IF;

  -- Retain the existing exactly-once unique index: (week_id, day, player_id).
  IF EXISTS (
    SELECT 1 FROM public.daily_sales
    WHERE week_id = p_week AND day = p_day AND player_id = p_player
  ) THEN
    RAISE EXCEPTION 'sale already recorded for this player/day';
  END IF;

  v_coins := floor(p_amount)::integer
    + CASE WHEN coalesce(p_hit, false) THEN 5 ELSE 0 END
    + CASE WHEN coalesce(p_top, false) THEN 10 ELSE 0 END;

  -- Existing unique indexes also enforce one top seller per day.
  INSERT INTO public.daily_sales(
    week_id, day, player_id, amount_million, target_million, target_hit, top_seller
  ) VALUES (
    p_week, p_day, p_player, p_amount, 0,
    coalesce(p_hit, false), coalesce(p_top, false)
  );

  UPDATE public.team_balances
  SET balance = balance + v_coins
  WHERE week_id = p_week AND team_id = v_team;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'team balance unavailable';
  END IF;

  INSERT INTO public.coin_ledger(week_id, team_id, delta, reason, day)
  VALUES (
    p_week, v_team, v_coins,
    'sale player=' || p_player || ' amount=' || p_amount ||
      ' target=' || coalesce(p_hit, false) || ' top=' || coalesce(p_top, false),
    p_day
  );

  RETURN v_coins;
END;
$function$
;


-- Fully automated prior-day settlement. Missing sales count as zero, without
-- requiring the manager to fill the form for every player.
-- The previous day is finalized from 12:05 Tehran on the following day.
-- After finalization, late edits to that day are intentionally disallowed.
CREATE OR REPLACE FUNCTION public.auto_finalize_past_days_v3()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
 v_week uuid;
 v_start date;
 v_today date := (now() AT TIME ZONE 'Asia/Tehran')::date;
 v_hour integer := extract(hour from (now() AT TIME ZONE 'Asia/Tehran'))::integer;
 v_last date;
 v_day date;
 v_status text;
 v_person record;
 v_result jsonb;
 v_processed integer := 0;
 v_zero_rows integer := 0;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
   RAISE EXCEPTION 'service role only';
 END IF;
 SELECT id,starts_on INTO v_week,v_start
 FROM public.weeks WHERE status='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','no_active_game'); END IF;
 -- Settle all sales dates up to and including the victory date, but never later.
 -- A completed game still needs its outstanding pre-victory combat to settle.
 v_last := v_today - CASE WHEN v_hour < 12 THEN 2 ELSE 1 END;
 SELECT LEAST(v_last, (won_at AT TIME ZONE 'Asia/Tehran')::date)
 INTO v_last
 FROM public.game_victories_v3 WHERE week_id=v_week;
 IF NOT FOUND THEN
   v_last := v_today - CASE WHEN v_hour < 12 THEN 2 ELSE 1 END;
 END IF;
 IF v_last < v_start THEN RETURN jsonb_build_object('status','nothing_due'); END IF;

 FOR v_day IN SELECT generate_series(v_start,v_last,'1 day'::interval)::date LOOP
   SELECT status INTO v_status FROM public.daily_rounds
   WHERE week_id=v_week AND day=v_day FOR UPDATE;
   IF v_status='settled' THEN CONTINUE; END IF;
   IF v_status IS NULL THEN
     PERFORM public.lock_daily_round_v2(v_week,v_day);
   END IF;
   PERFORM public.resolve_roles_and_consume_shields_v2(v_week,v_day);
   FOR v_person IN
     SELECT a.user_id FROM public.assignments a
     WHERE a.week_id=v_week
       AND NOT EXISTS (
         SELECT 1 FROM public.daily_sales s
         WHERE s.week_id=v_week AND s.day=v_day AND s.player_id=a.user_id
       )
   LOOP
     -- Insert zero sales directly; the normal sale RPC rejects new entries after victory.
     -- Zero coins do not change team balances or coin ledger.
     INSERT INTO public.daily_sales(
       week_id,day,player_id,amount_million,target_million,target_hit,top_seller
     ) VALUES (v_week,v_day,v_person.user_id,0,0,false,false)
     ON CONFLICT (week_id,day,player_id) DO NOTHING;
     v_zero_rows:=v_zero_rows+1;
   END LOOP;
   v_result := public.settle_daily_combat_v2(v_week,v_day);
   v_processed:=v_processed+1;
 END LOOP;
 RETURN jsonb_build_object('status','ok','settled_days',v_processed,'zero_sales_added',v_zero_rows);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.cron_auto_finalize_v3()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 RETURN public.auto_finalize_past_days_v3();
END;
$fn$;
REVOKE ALL ON FUNCTION public.auto_finalize_past_days_v3() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cron_auto_finalize_v3() FROM PUBLIC, anon, authenticated;

-- Times are UTC in pg_cron: minute 35 UTC = minute 05 Tehran (UTC+03:30).
-- Requires pg_cron installed (already present in golden-vault-test).
SELECT cron.schedule('golden-vault-auto-finalize-v3','35 * * * *',
  'SELECT public.cron_auto_finalize_v3();');

COMMIT;
