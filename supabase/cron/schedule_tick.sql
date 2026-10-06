-- ============================================================================
-- Switch on the background job (sending emails + reading replies) on the LIVE site.
--
-- HOW: open the Supabase dashboard -> SQL Editor -> New query, paste this file,
--      replace the two values below, click Run. Do it ONCE.
--
-- !! NEVER save the real secret in this file or commit it to GitHub. !!
--    Type the real value only in the Supabase SQL editor (it is not saved to
--    the project). This file in the repo must keep the placeholders.
-- ============================================================================

-- 1. Store the live URL and the secret in Vault (encrypted storage inside Supabase).
--    - the URL:    your live app + /api/cron/tick
--    - the secret: EXACTLY the same value as CRON_SECRET in the Vercel env vars
--                  (if they differ, the timer gets 401 and nothing is sent)
select vault.create_secret('https://inbox-hype.vercel.app/api/cron/tick', 'tick_url');
select vault.create_secret('PASTE-THE-CRON_SECRET-HERE', 'cron_secret');

-- 2. Call the tick every minute.
select cron.schedule('inboxhype-tick', '* * * * *', 'select private.call_tick()');

-- ----------------------------------------------------------------------------
-- Check it runs (run these after about 2 minutes):
--   select jobname, schedule, active from cron.job;
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
--   -- what the app answered (200 = good, 401 = secret differs, 404/500 = app problem):
--   select id, status_code, left(content::text, 200) as answer, created from net._http_response order by created desc limit 5;
--
-- Pause it:   select cron.unschedule('inboxhype-tick');
-- Change the URL or the secret later (Vault entries):
--   select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), 'NEW-VALUE');
--   select vault.update_secret((select id from vault.secrets where name = 'tick_url'), 'https://...');
-- ----------------------------------------------------------------------------
