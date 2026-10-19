-- KNF Field Data: security hardening (Supabase Security Advisor, Oct 2026). Safe to run more than once.

-- 1. PostGIS's map-projection table (spatial_ref_sys) is public reference data, not project data.
--    Make it read-only through the API, and switch on RLS if Supabase lets us (it belongs to PostGIS).
do $$ begin
  if to_regclass('public.spatial_ref_sys') is null then return; end if;   -- PostGIS already moved to the "extensions" schema
  revoke insert, update, delete, truncate on public.spatial_ref_sys from anon, authenticated;
  begin
    alter table public.spatial_ref_sys enable row level security;
    drop policy if exists read_all on public.spatial_ref_sys;
    create policy read_all on public.spatial_ref_sys for select using (true);
  exception when insufficient_privilege then
    raise notice 'spatial_ref_sys belongs to the PostGIS extension: run supabase_move_extensions.sql to move it out of public';
  end;
end $$;

-- 2. The data tables: only signed-in accounts with a profile that is switched ON (not just "anyone signed in").
do $$ begin   -- once supabase_testonly.sql has run, it owns the records policies (test-only people cannot write project data)
  if to_regprocedure('public.my_test_only()') is not null then return; end if;
  drop policy if exists crew_rw on public.records;
  create policy crew_rw on public.records for all to authenticated
    using ((select public.my_role()) is not null) with check ((select public.my_role()) is not null);
end $$;
drop policy if exists crew_rw on public.records_test;
create policy crew_rw on public.records_test for all to authenticated
  using ((select public.my_role()) is not null) with check ((select public.my_role()) is not null);
drop policy if exists crew_read_hist on public.records_history;
create policy crew_read_hist on public.records_history for select to authenticated using ((select public.my_role()) is not null);
drop policy if exists crew_read on public.site_registry;
create policy crew_read on public.site_registry for select to authenticated using ((select public.my_role()) is not null);

-- 3. Helper functions: not callable by people who are not signed in.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.records_log() from public, anon, authenticated;
revoke execute on function public.my_role() from public, anon;
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.my_role() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- 4. Fixed search_path on the remaining functions.
alter function public.profiles_guard() set search_path = public;
alter function public.records_stamp() set search_path = public;
alter function public.unit_xy(float8, float8, float8, float8, float8) set search_path = public;
