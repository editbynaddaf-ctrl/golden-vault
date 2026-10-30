-- Execute ONCE in Supabase SQL Editor, after schema.sql.
-- Daily sales: one row per player/day, with explicitly chosen manager bonuses.
alter table public.daily_sales add column if not exists target_hit boolean not null default false;
alter table public.daily_sales add column if not exists top_seller boolean not null default false;
create unique index if not exists one_top_seller_per_day on public.daily_sales(week_id,day) where top_seller=true;
create or replace function public.register_daily_sale_v2(
 p_week uuid,p_day date,p_player uuid,p_amount numeric,p_hit boolean,p_top boolean
) returns integer language plpgsql security definer set search_path=public as $$
declare v_team uuid;v_coins integer;
begin
 if auth.role()<>'service_role' then raise exception 'service role only'; end if;
 if not exists(select 1 from weeks where id=p_week and status='active') then raise exception 'inactive week'; end if;
 if p_day is null or p_day > (now() at time zone 'Asia/Tehran')::date or p_day < (select starts_on from weeks where id=p_week) - 1 then raise exception 'invalid day'; end if;
 if p_amount is null or p_amount<0 or p_amount>1000000 or p_amount<>round(p_amount,2) then raise exception 'invalid amount'; end if;
 select team_id into v_team from profiles where id=p_player and is_admin=false;
 if v_team is null then raise exception 'player has no team'; end if;
 if not exists(select 1 from team_balances where week_id=p_week and team_id=v_team) then raise exception 'team not enrolled'; end if;
 v_coins:=floor(p_amount)::integer+case when p_hit then 5 else 0 end+case when p_top then 10 else 0 end;
 insert into daily_sales(week_id,day,player_id,amount_million,target_million,target_hit,top_seller)
 values(p_week,p_day,p_player,p_amount,0,p_hit,p_top);
 update team_balances set balance=balance+v_coins where week_id=p_week and team_id=v_team;
 insert into coin_ledger(week_id,team_id,delta,reason,day)
 values(p_week,v_team,v_coins,'sale player='||p_player||' amount='||p_amount||' target='||p_hit||' top='||p_top,p_day);
 return v_coins;
end $$;
revoke all on function public.register_daily_sale_v2(uuid,date,uuid,numeric,boolean,boolean) from public,anon,authenticated;
grant execute on function public.register_daily_sale_v2(uuid,date,uuid,numeric,boolean,boolean) to service_role;
