-- KNF Field Data: "test mode only" accounts (Oct 2026). Safe to run more than once.
-- New logins start in test mode: they can practise, but the server will not let them write project (live) records.
-- Erlend switches people to live data one by one, or everyone at once, on the People page.

-- 1. Project-wide switch: do NEW logins start in test mode? (true = yes)
create table if not exists public.app_config (key text primary key, value jsonb not null, updated_at timestamptz default now());
alter table public.app_config enable row level security;
drop policy if exists config_read on public.app_config;
create policy config_read on public.app_config for select to authenticated using ((select public.my_role()) is not null);
drop policy if exists config_admin on public.app_config;
create policy config_admin on public.app_config for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
insert into public.app_config (key, value) values ('new_users_test_only', 'true') on conflict (key) do nothing;

create or replace function public.new_user_test_only() returns boolean language sql stable security definer set search_path = public as $f$
  select coalesce((select value = 'true'::jsonb from public.app_config where key = 'new_users_test_only'), true) $f$;

-- 2. Per-person flag. Existing people get it too; Erlend (PI) is set to live data below.
alter table public.profiles add column if not exists test_only boolean not null default public.new_user_test_only();
update public.profiles set test_only = false where role = 'PI / Co-PI' and test_only;

create or replace function public.my_test_only() returns boolean language sql stable security definer set search_path = public as $f$
  select coalesce((select test_only from public.profiles where id = auth.uid()), true) $f$;
revoke execute on function public.new_user_test_only() from public, anon;
revoke execute on function public.my_test_only() from public, anon;
grant execute on function public.new_user_test_only() to authenticated;
grant execute on function public.my_test_only() to authenticated;

-- 3. Only the PI can switch someone's test-only flag (people cannot take themselves out of test mode).
create or replace function public.profiles_guard() returns trigger language plpgsql set search_path = public as $f$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role; new.disabled := old.disabled; new.email := old.email; new.test_only := old.test_only;
  end if;
  new.updated_at := now();
  return new;
end $f$;

-- 4. Project records: everyone signed in may read; only people NOT in test-only mode may add, change or delete.
--    (records_test, the practice table, is unchanged: everyone may write there.)
drop policy if exists crew_rw on public.records;
drop policy if exists crew_read on public.records;
drop policy if exists crew_ins on public.records;
drop policy if exists crew_upd on public.records;
drop policy if exists crew_del on public.records;
create policy crew_read on public.records for select to authenticated using ((select public.my_role()) is not null);
create policy crew_ins on public.records for insert to authenticated
  with check ((select public.my_role()) is not null and not (select public.my_test_only()));
create policy crew_upd on public.records for update to authenticated
  using ((select public.my_role()) is not null and not (select public.my_test_only()))
  with check ((select public.my_role()) is not null and not (select public.my_test_only()));
create policy crew_del on public.records for delete to authenticated
  using ((select public.my_role()) is not null and not (select public.my_test_only()));

-- check
select email, role, test_only from public.profiles order by email;
