-- Run in Supabase SQL Editor. Keep service role key on server only.
create extension if not exists pgcrypto;
create table public.teams(id uuid primary key default gen_random_uuid(),name text unique not null);
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,name text not null,team_id uuid references public.teams(id),is_admin boolean not null default false);
create table public.weeks(id uuid primary key default gen_random_uuid(),starts_on date not null default current_date,status text not null default 'active' check(status in ('active','closed')),winning_key integer not null check(winning_key between 1 and 20),created_at timestamptz not null default now());
create unique index one_active_week on public.weeks(status) where status='active';
create table public.assignments(week_id uuid references public.weeks(id),user_id uuid references public.profiles(id),role text not null check(role in ('commander','thief','killer','guardian','spy')),primary key(week_id,user_id));
create table public.team_balances(week_id uuid references public.weeks(id),team_id uuid references public.teams(id),balance integer not null default 0 check(balance>=0),primary key(week_id,team_id));
create table public.key_checks(id uuid primary key default gen_random_uuid(),week_id uuid references public.weeks(id),team_id uuid references public.teams(id),key_number integer not null check(key_number between 1 and 20),kind text not null check(kind in ('test','eliminate')),result text not null check(result in ('correct','wrong')),created_at timestamptz not null default now(),unique(week_id,team_id,key_number));
create table public.operations(id uuid primary key default gen_random_uuid(),week_id uuid references public.weeks(id),actor_id uuid references public.profiles(id),target_id uuid references public.profiles(id),kind text not null check(kind in ('thief','killer','guardian','spy_key','spy_role','attack')),day date not null default current_date,result text,status text not null default 'pending',created_at timestamptz not null default now());
create unique index once_week_power on public.operations(week_id,actor_id,kind) where kind in ('thief','killer','spy_key','spy_role','attack');
create unique index once_day_guardian on public.operations(week_id,actor_id,day) where kind='guardian';
create table public.daily_sales(id uuid primary key default gen_random_uuid(),week_id uuid references public.weeks(id),day date not null,player_id uuid references public.profiles(id),amount_million numeric(12,2) not null check(amount_million>=0),target_million numeric(12,2) not null check(target_million>=0),unique(week_id,day,player_id));
create table public.coin_ledger(id uuid primary key default gen_random_uuid(),week_id uuid references public.weeks(id),team_id uuid references public.teams(id),delta integer not null,reason text not null,day date not null default current_date,created_at timestamptz not null default now());
create table public.announcements(id uuid primary key default gen_random_uuid(),week_id uuid references public.weeks(id),message text not null,created_at timestamptz not null default now());
alter table public.teams enable row level security;alter table public.profiles enable row level security;alter table public.weeks enable row level security;alter table public.assignments enable row level security;alter table public.team_balances enable row level security;alter table public.key_checks enable row level security;alter table public.operations enable row level security;alter table public.daily_sales enable row level security;alter table public.coin_ledger enable row level security;alter table public.announcements enable row level security;
create policy team_read on public.teams for select to authenticated using(true);
create policy profile_read on public.profiles for select to authenticated using(true);
-- winning_key must NEVER be exposed to authenticated users; only expose a safe view
revoke all on public.weeks from anon,authenticated;
create policy own_roles on public.assignments for select to authenticated using(user_id=auth.uid());
create policy own_balances on public.team_balances for select to authenticated using(team_id=(select team_id from public.profiles where id=auth.uid()));
create policy own_keys on public.key_checks for select to authenticated using(team_id=(select team_id from public.profiles where id=auth.uid()));
create policy public_announcements on public.announcements for select to authenticated using(true);
create view public.safe_weeks with (security_invoker=true) as select id,status,starts_on from public.weeks;
-- No direct table write grants for players. All writes use server-side verified routes.
revoke insert,update,delete on all tables in schema public from anon,authenticated;
-- Atomic key purchase: prevents double spending and concurrent duplicate key checks.
create or replace function public.purchase_key(p_week uuid,p_team uuid,p_key integer,p_kind text,p_cost integer)
returns text language plpgsql security definer set search_path=public as $$
declare w integer; result_text text;
begin
 if p_key not between 1 and 20 or (p_kind='test' and p_cost<>50) or (p_kind='eliminate' and p_cost<>30) then raise exception 'invalid purchase'; end if;
 select winning_key into w from weeks where id=p_week and status='active' for update;
 if w is null then raise exception 'no active week'; end if;
 if exists(select 1 from key_checks where week_id=p_week and team_id=p_team and key_number=p_key) then raise exception 'key already checked'; end if;
 if p_kind='eliminate' and p_key=w then raise exception 'cannot eliminate winning key'; end if;
 update team_balances set balance=balance-p_cost where week_id=p_week and team_id=p_team and balance>=p_cost;
 if not found then raise exception 'insufficient coins'; end if;
 result_text:=case when p_key=w then 'correct' else 'wrong' end;
 insert into key_checks(week_id,team_id,key_number,kind,result) values(p_week,p_team,p_key,p_kind,result_text);
 insert into coin_ledger(week_id,team_id,delta,reason) values(p_week,p_team,-p_cost,p_kind||' key '||p_key);
 return result_text;
end $$;
revoke execute on function public.purchase_key(uuid,uuid,integer,text,integer) from public,anon,authenticated;
create or replace function public.current_week_safe() returns table(id uuid,status text,starts_on date) language sql security definer set search_path=public as $$ select id,status,starts_on from weeks where status='active' limit 1 $$;
grant execute on function public.current_week_safe() to authenticated;
