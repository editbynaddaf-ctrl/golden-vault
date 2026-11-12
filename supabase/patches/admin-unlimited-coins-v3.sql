-- Unlimited frequency admin coin grants. Wallet operations remain atomic.
CREATE OR REPLACE FUNCTION public.admin_grant_coins_unlimited_v3(
  p_team uuid, p_amount integer, p_note text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_week uuid; v_balance bigint; v_new bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role only';
  END IF;
  IF p_team IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid coin grant';
  END IF;
  -- Synchronize with the transfer to a new game; grants are never lost between rounds.
  PERFORM pg_advisory_xact_lock(81942,3001);
  SELECT id INTO v_week FROM public.weeks
    WHERE status='active' FOR UPDATE;
  IF v_week IS NULL THEN RAISE EXCEPTION 'no active game'; END IF;

  SELECT balance INTO v_balance FROM public.team_balances
    WHERE week_id=v_week AND team_id=p_team FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'team wallet not found'; END IF;
  v_new := v_balance + p_amount::bigint;
  IF v_new > 2147483647 THEN RAISE EXCEPTION 'wallet would overflow'; END IF;
  UPDATE public.team_balances SET balance=v_new::integer
    WHERE week_id=v_week AND team_id=p_team;
  INSERT INTO public.coin_ledger(week_id,team_id,delta,reason,day,balance_after,source_type)
  VALUES(v_week,p_team,p_amount,
    'admin grant: ' || LEFT(COALESCE(NULLIF(BTRIM(p_note),''),'manual credit'),300),
    (now() AT TIME ZONE 'Asia/Tehran')::date,
    v_new::integer,'admin_grant');
  RETURN v_new::integer;
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_grant_coins_unlimited_v3(uuid,integer,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_coins_unlimited_v3(uuid,integer,text)
 TO service_role;
