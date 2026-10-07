-- Postal: send through the Postal HTTP API, hear back through a Postal webhook
-- (delivered / delayed / failed / bounced / held / DNS problems) and a Postal
-- route with an HTTP endpoint (replies).
--
-- One postal_servers row per workspace + Postal URL. It holds the secret token
-- that is part of the webhook and route URLs. All Postal inboxes of the same
-- server share it, so the user sets the route and the webhook up only once.

create table public.postal_servers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Normalized origin, e.g. https://postal.example.com
  api_url text not null check (api_url ~ '^https://[a-z0-9.-]+(:[0-9]{1,5})?$'),
  hook_token text not null unique check (char_length(hook_token) >= 32),
  -- Set when a "Check setup" test email came back through the webhook / route.
  webhook_ok_at timestamptz,
  route_ok_at timestamptz,
  last_webhook_at timestamptz,
  last_inbound_at timestamptz,
  check_message_id text,
  check_sent_at timestamptz,
  -- Last problem Postal reported (email held, DNS error, delivery refused).
  warning text,
  warning_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, api_url),
  unique (id, workspace_id)
);

create trigger postal_servers_updated_at
  before update on public.postal_servers
  for each row execute function private.set_updated_at();

-- Members can read (they need the URLs); only the server writes, so nobody can
-- pick their own token.
alter table public.postal_servers enable row level security;
revoke all on public.postal_servers from anon;
revoke insert, update, delete on public.postal_servers from authenticated;
create policy "members can view" on public.postal_servers for select to authenticated
  using (workspace_id in (select private.user_workspace_ids()));

-- Email accounts: a Postal inbox has no SMTP / IMAP settings, it points at its server.
alter table public.email_accounts
  add column postal_server_id uuid,
  alter column smtp_host drop not null,
  alter column smtp_port drop not null,
  alter column smtp_username drop not null,
  add constraint email_accounts_postal_server_fkey foreign key (postal_server_id, workspace_id)
    references public.postal_servers (id, workspace_id) on delete cascade,
  add constraint email_accounts_connection_check check (
    case when provider = 'postal'
      then postal_server_id is not null and imap_host is null
      else smtp_host is not null and smtp_port is not null and smtp_username is not null
    end
  );

create index email_accounts_postal_server_idx on public.email_accounts (postal_server_id)
  where postal_server_id is not null;

-- Sent messages: Postal's own id + what Postal told us about the delivery.
alter table public.sent_messages
  add column provider_message_id text,
  add column delivery_status text check (delivery_status in ('delivered', 'delayed', 'held', 'failed')),
  add column delivery_detail text check (char_length(delivery_detail) <= 1000),
  add column delivered_at timestamptz;

create index sent_messages_provider_message_idx on public.sent_messages (provider_message_id)
  where provider_message_id is not null;

-- ingest_inbound: same as before, but the bounce event says where it came from
-- (p_message.source: imap | postal_route | postal_webhook; default imap).
create or replace function public.ingest_inbound(
  p_account_id uuid,
  p_kind text,
  p_sent_message_id uuid,
  p_match_method text,
  p_message jsonb
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sm public.sent_messages;
  v_id uuid;
  v_received timestamptz := coalesce((p_message ->> 'received_at')::timestamptz, now());
  v_stop boolean;
  v_first boolean;
begin
  if p_kind not in ('reply', 'auto_reply', 'bounce') then
    raise exception 'bad_kind';
  end if;

  select * into v_sm
  from public.sent_messages
  where id = p_sent_message_id and email_account_id = p_account_id
  for update;
  if not found then
    return 'no_match';
  end if;

  insert into public.inbox_messages (
    workspace_id, email_account_id, lead_id, campaign_id, sent_message_id,
    direction, kind, message_id, in_reply_to, references_header,
    from_email, from_name, to_email, subject, text_body, html_body,
    imap_uid, received_at, is_read, match_method
  )
  values (
    v_sm.workspace_id, p_account_id, v_sm.lead_id, v_sm.campaign_id, v_sm.id,
    'inbound', p_kind, p_message ->> 'message_id', p_message ->> 'in_reply_to', p_message ->> 'references',
    p_message ->> 'from_email', p_message ->> 'from_name', p_message ->> 'to_email',
    coalesce(left(p_message ->> 'subject', 998), ''),
    left(p_message ->> 'text_body', 200000), left(p_message ->> 'html_body', 500000),
    (p_message ->> 'imap_uid')::bigint, v_received,
    -- only real replies count as "unread" in the Unibox
    p_kind <> 'reply', p_match_method
  )
  on conflict (email_account_id, message_id) do nothing
  returning id into v_id;
  if v_id is null then
    return 'duplicate';
  end if;

  if p_kind = 'reply' then
    v_first := v_sm.replied_at is null;
    update public.sent_messages set replied_at = coalesce(replied_at, v_received) where id = v_sm.id;

    select c.stop_on_reply into v_stop from public.campaigns c where c.id = v_sm.campaign_id;
    update public.campaign_leads
    set replied_at = coalesce(replied_at, v_received),
        status = case when v_stop and status in ('queued', 'in_progress', 'completed') then 'replied' else status end,
        next_send_at = case when v_stop and status in ('queued', 'in_progress', 'completed') then null else next_send_at end
    where id = v_sm.campaign_lead_id;

    if v_first then
      insert into public.events (workspace_id, campaign_id, lead_id, sent_message_id, type, metadata)
      values (v_sm.workspace_id, v_sm.campaign_id, v_sm.lead_id, v_sm.id, 'replied',
              jsonb_build_object('step', v_sm.step_position, 'inbox_message_id', v_id));
    end if;
    perform private.complete_campaign_if_done(v_sm.campaign_id);

  elsif p_kind = 'bounce' then
    v_first := v_sm.status = 'sent';
    update public.sent_messages
    set status = 'bounced', bounced_at = coalesce(bounced_at, v_received)
    where id = v_sm.id and status = 'sent';

    update public.campaign_leads
    set status = 'bounced', next_send_at = null
    where id = v_sm.campaign_lead_id and status in ('queued', 'in_progress', 'completed');

    insert into public.suppressions (workspace_id, email, reason)
    values (v_sm.workspace_id, v_sm.to_email, 'bounced')
    on conflict (workspace_id, email) do nothing;

    if v_first then
      insert into public.events (workspace_id, campaign_id, lead_id, sent_message_id, type, metadata)
      values (v_sm.workspace_id, v_sm.campaign_id, v_sm.lead_id, v_sm.id, 'bounced',
              jsonb_build_object('step', v_sm.step_position,
                                 'source', coalesce(p_message ->> 'source', 'imap'),
                                 'inbox_message_id', v_id));
    end if;
    perform private.complete_campaign_if_done(v_sm.campaign_id);
  end if;

  return 'stored';
end;
$$;

revoke all on function public.ingest_inbound(uuid, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_inbound(uuid, text, uuid, text, jsonb) to service_role;
