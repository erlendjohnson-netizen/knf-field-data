-- KNF Field Data: daily PDF reports by email. Run once in the Supabase SQL editor (after supabase_setup.sql),
-- after the Edge Function "daily-reports" is deployed with "Verify JWT" switched OFF.

-- who gets the reports: null = the default for the role (on for PI / Co-PI and Field director / crew chief)
alter table public.profiles add column if not exists email_reports boolean;

-- one row per day and mode, so each day's reports go out once (again only after a later bag check)
create table if not exists public.report_log (
  day date not null, mode text not null, checks_n int not null default 0,
  sent_at timestamptz, sent_to text, failed text, primary key (day, mode));
alter table public.report_log enable row level security;
drop policy if exists report_log_read on public.report_log;
create policy report_log_read on public.report_log for select to authenticated using (public.is_staff());

-- every 15 minutes, ask the function to send whatever is due
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname = 'knf-daily-reports';
select cron.schedule('knf-daily-reports', '*/15 * * * *',
  $$ select net.http_post(url := 'https://xmvzhxlqagstuvqvcyhc.supabase.co/functions/v1/daily-reports',
       headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb) $$);
