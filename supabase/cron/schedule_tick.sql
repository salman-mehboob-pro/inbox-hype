-- Schedules the sending tick. Run ONCE, by hand, in the Supabase SQL editor
-- when the app is deployed (not a migration: it holds your real URL + secret).
--
-- 1. Store the tick URL and the secret in Vault (replace the two values).
--    The secret must be the same as CRON_SECRET in the Vercel env vars.
select vault.create_secret('https://YOUR-APP.vercel.app/api/cron/tick', 'tick_url');
select vault.create_secret('PASTE-THE-CRON_SECRET-HERE', 'cron_secret');

-- 2. Call the tick every minute.
select cron.schedule('inboxhype-tick', '* * * * *', 'select private.call_tick()');

-- Check it runs (last 10 runs) and what the app answered:
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select id, status_code, content from net._http_response order by created desc limit 10;
--
-- Stop it:
--   select cron.unschedule('inboxhype-tick');
-- Change the URL or secret later:
--   select vault.update_secret((select id from vault.secrets where name = 'tick_url'), 'https://...');
