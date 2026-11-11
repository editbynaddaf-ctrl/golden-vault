-- Golden Vault V3: atomic new round with carried-forward wallets.
-- Apply AFTER auto-gameplay-v3.sql, only when this application release is ready.
BEGIN;
CREATE OR REPLACE FUNCTION public.start_next_game_v3()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE
  old_week uuid;
  new_week uuid;
  v_teams integer;
  v_players integer;
  v_team record;
  v_roles text[] := ARRAY['commander','thief','killer','guardian','spy'];
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role only';
  END IF;
  -- Serialize concurrent starts. Also serializes with atomic key purchases.
  PERFORM pg_advisory_xact_lock(81942,3001);
  SELECT id INTO old_week FROM public.weeks WHERE status='active' FOR UPDATE;
  IF old_week IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.game_victories_v3 WHERE week_id=old_week
  ) THEN RAISE EXCEPTION 'current game has not been won'; END IF;

  SELECT count(*) INTO v_teams FROM public.teams;
  SELECT count(*) INTO v_players FROM public.profiles WHERE is_admin=false;
  IF v_teams<>2 OR v_players<>10 THEN RAISE EXCEPTION 'two teams and ten players required'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.teams t LEFT JOIN public.profiles p
      ON p.team_id=t.id AND p.is_admin=false
    GROUP BY t.id HAVING count(p.id)<>5
  ) THEN RAISE EXCEPTION 'each team must have five players'; END IF;

  IF old_week IS NOT NULL THEN
    -- All previously scheduled financial settlements must complete before copying wallets.
    -- Unresolved same-day operations are cancelled when the vault opens.
    IF EXISTS (
      SELECT 1 FROM generate_series(
        (SELECT starts_on FROM public.weeks WHERE id=old_week),
        (now() AT TIME ZONE 'Asia/Tehran')::date - 1,
        interval '1 day'
      ) AS dates(d)
      LEFT JOIN public.daily_rounds r
        ON r.week_id=old_week AND r.day=dates.d::date
      WHERE r.status IS DISTINCT FROM 'settled'
    ) THEN RAISE EXCEPTION 'previous-day settlement is incomplete'; END IF;
    UPDATE public.operations SET status='canceled',
      result='{"outcome":"game_ended"}'
      WHERE week_id=old_week AND status='pending';
    UPDATE public.weeks SET status='closed' WHERE id=old_week;
  END IF;

  INSERT INTO public.weeks(starts_on,status,winning_key)
    VALUES((now() AT TIME ZONE 'Asia/Tehran')::date,'active',1+floor(random()*20)::int)
    RETURNING id INTO new_week;

  FOR v_team IN SELECT id FROM public.teams ORDER BY id LOOP
    INSERT INTO public.team_balances(week_id,team_id,balance)
    SELECT new_week,v_team.id,
      COALESCE((SELECT balance FROM public.team_balances
        WHERE week_id=old_week AND team_id=v_team.id),0);
    INSERT INTO public.coin_ledger(week_id,team_id,delta,reason,day)
    VALUES(new_week,v_team.id,0,
      'opening balance carried from game '||COALESCE(old_week::text,'initial'),
      (now() AT TIME ZONE 'Asia/Tehran')::date);
    INSERT INTO public.assignments(week_id,user_id,role)
    SELECT new_week,ordered.id,v_roles[ordered.rn::int]
    FROM (SELECT p.id,row_number() over(order by gen_random_uuid()) rn
      FROM public.profiles p WHERE p.team_id=v_team.id AND p.is_admin=false) ordered;
  END LOOP;
  RETURN new_week;
END;
$fn$;
REVOKE ALL ON FUNCTION public.start_next_game_v3() FROM PUBLIC,anon,authenticated;
-- Lock game actions against the atomic victory record, even with concurrent requests.
CREATE OR REPLACE FUNCTION public.prevent_operation_after_victory_v3()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $guard$
BEGIN
  PERFORM 1 FROM public.weeks WHERE id=NEW.week_id AND status='active' FOR UPDATE;
  IF NOT FOUND OR EXISTS (
    SELECT 1 FROM public.game_victories_v3 WHERE week_id=NEW.week_id
  ) THEN RAISE EXCEPTION 'game ended: actions are closed'; END IF;
  RETURN NEW;
END;
$guard$;
DROP TRIGGER IF EXISTS prevent_operation_after_victory_v3 ON public.operations;
CREATE TRIGGER prevent_operation_after_victory_v3
BEFORE INSERT ON public.operations FOR EACH ROW
EXECUTE FUNCTION public.prevent_operation_after_victory_v3();
REVOKE ALL ON FUNCTION public.prevent_operation_after_victory_v3() FROM PUBLIC,anon,authenticated;
COMMIT;
