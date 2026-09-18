-- Run the reminder dispatcher every minute from Supabase Cron.
-- Before applying this migration, create a Vault secret named
-- `health_guardian_cron_secret` and set the same value as CRON_SECRET in Vercel.
create extension if not exists "pg_cron";
create extension if not exists "pg_net";

do $$
declare
  cron_secret text;
  existing_job record;
begin
  select decrypted_secret
    into cron_secret
    from vault.decrypted_secrets
   where name = 'health_guardian_cron_secret'
   limit 1;

  if cron_secret is null or length(cron_secret) < 32 then
    raise exception 'Create a Vault secret named health_guardian_cron_secret with at least 32 characters before scheduling reminders.';
  end if;

  for existing_job in
    select jobid from cron.job where jobname = 'health-guardian-send-reminders'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end
$$;

select cron.schedule(
  'health-guardian-send-reminders',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://health-guardian-test.vercel.app/api/check-session?task=send-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
            from vault.decrypted_secrets
           where name = 'health_guardian_cron_secret'
           limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    ) as request_id;
  $cron$
);
