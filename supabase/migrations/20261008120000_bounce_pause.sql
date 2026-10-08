-- Pause a campaign automatically when too many of its recent emails bounce.
--
-- campaigns.bounce_pause_percent: null = off (default). N = pause when N or more of the
--   campaign's last 100 emails bounced (N% of 100). Counted as a NUMBER of bounces, so a
--   campaign that has sent only a few emails is not paused by one early bounce.
-- campaigns.paused_reason: why the campaign was paused automatically (shown in the app).
-- campaigns.bounce_check_from: on resume after an auto-pause, only emails from then on
--   count, so the old bounces don't pause it again right away.
-- The check runs on every new "bounced" event (route, webhook or a refused send), so
-- every bounce path is covered without changing those functions.

alter table public.campaigns
  add column bounce_pause_percent smallint check (bounce_pause_percent between 1 and 100),
  add column paused_reason text check (char_length(paused_reason) <= 500),
  add column bounce_check_from timestamptz;

create or replace function private.pause_campaign_on_bounces()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_camp public.campaigns;
  v_total integer;
  v_bounced integer;
begin
  select * into v_camp from public.campaigns where id = new.campaign_id;
  if not found or v_camp.status <> 'active' or v_camp.bounce_pause_percent is null then
    return null;
  end if;

  -- The campaign's last 100 emails that really went out (sent or bounced), plus sends
  -- that were refused right away because the address is bad.
  select count(*)::integer, count(*) filter (where t.bounced)::integer
  into v_total, v_bounced
  from (
    select m.status = 'bounced' or b.hit as bounced
    from public.sent_messages m
    cross join lateral (
      select exists (
        select 1 from public.events e where e.sent_message_id = m.id and e.type = 'bounced'
      ) as hit
    ) b
    where m.campaign_id = v_camp.id
      and m.created_at >= coalesce(v_camp.bounce_check_from, '-infinity'::timestamptz)
      and (m.status in ('sent', 'bounced') or (m.status = 'failed' and b.hit))
    order by m.created_at desc
    limit 100
  ) t;

  if v_bounced >= v_camp.bounce_pause_percent then
    update public.campaigns
    set status = 'paused',
        paused_reason = format(
          'Paused automatically: %s of the last %s emails bounced (limit: %s%% of the last 100).',
          v_bounced, v_total, v_camp.bounce_pause_percent
        )
    where id = v_camp.id and status = 'active';
  end if;
  return null;
end;
$$;

revoke all on function private.pause_campaign_on_bounces() from public, anon, authenticated;

create trigger events_pause_campaign_on_bounces
  after insert on public.events
  for each row
  when (new.type = 'bounced' and new.campaign_id is not null)
  execute function private.pause_campaign_on_bounces();

-- duplicate_campaign: also copies the bounce setting.
create or replace function public.duplicate_campaign(p_campaign_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_src public.campaigns;
  v_new_id uuid;
begin
  -- RLS: only a campaign of the open workspace is found.
  select * into v_src from public.campaigns where id = p_campaign_id;
  if not found then
    raise exception 'campaign_not_found';
  end if;

  insert into public.campaigns (
    workspace_id, name, status, timezone, send_days, window_start, window_end, use_lead_timezone,
    daily_limit, gap_min_minutes, gap_max_minutes, track_opens, track_clicks, stop_on_reply,
    include_unsubscribe, bounce_pause_percent
  )
  values (
    v_src.workspace_id, left(v_src.name, 193) || ' (copy)', 'draft', v_src.timezone, v_src.send_days,
    v_src.window_start, v_src.window_end, v_src.use_lead_timezone, v_src.daily_limit,
    v_src.gap_min_minutes, v_src.gap_max_minutes, v_src.track_opens, v_src.track_clicks,
    v_src.stop_on_reply, v_src.include_unsubscribe, v_src.bounce_pause_percent
  )
  returning id into v_new_id;

  insert into public.sequence_steps (
    campaign_id, workspace_id, position, delay_days, delay_hours, subject, body, body_format
  )
  select v_new_id, workspace_id, position, delay_days, delay_hours, subject, body, body_format
  from public.sequence_steps
  where campaign_id = p_campaign_id;

  insert into public.campaign_email_accounts (campaign_id, email_account_id, workspace_id)
  select v_new_id, email_account_id, workspace_id
  from public.campaign_email_accounts
  where campaign_id = p_campaign_id;

  return v_new_id;
end;
$$;

revoke all on function public.duplicate_campaign(uuid) from public, anon;
grant execute on function public.duplicate_campaign(uuid) to authenticated;
