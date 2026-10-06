-- App tables: email accounts, leads, suppressions, campaigns, sequences,
-- campaign leads, sent messages, inbox messages, events.
--
-- Every table has workspace_id. Child tables use composite foreign keys
-- (parent_id, workspace_id) so a row can never point at another workspace's data.

-- Email accounts (inboxes) ----------------------------------------------------
create table public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email extensions.citext not null,
  from_name text not null default '' check (char_length(from_name) <= 100),
  provider text not null default 'custom'
    check (provider in ('gmail', 'outlook', 'yahoo', 'zoho', 'postal', 'custom')),
  smtp_host text not null,
  smtp_port integer not null check (smtp_port between 1 and 65535),
  smtp_secure boolean not null default true,
  smtp_username text not null,
  imap_host text,
  imap_port integer check (imap_port between 1 and 65535),
  imap_secure boolean not null default true,
  imap_username text,
  daily_limit integer not null default 30 check (daily_limit between 1 and 500),
  min_delay_seconds integer not null default 60 check (min_delay_seconds >= 0),
  max_delay_seconds integer not null default 180,
  signature text not null default '',
  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  last_error text,
  last_tested_at timestamptz,
  last_sent_at timestamptz,
  next_available_at timestamptz,
  imap_uid_validity bigint,
  imap_last_uid bigint,
  imap_last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, email),
  unique (id, workspace_id),
  check (max_delay_seconds >= min_delay_seconds)
);

create trigger email_accounts_updated_at
  before update on public.email_accounts
  for each row execute function private.set_updated_at();

-- Encrypted passwords live in their own table. RLS on, no policies:
-- only the server (service role) can read or write it.
create table public.email_account_secrets (
  email_account_id uuid primary key references public.email_accounts (id) on delete cascade,
  smtp_password_enc text not null,
  imap_password_enc text,
  updated_at timestamptz not null default now()
);

create trigger email_account_secrets_updated_at
  before update on public.email_account_secrets
  for each row execute function private.set_updated_at();

-- Leads -------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email extensions.citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  first_name text,
  last_name text,
  company text,
  title text,
  phone text,
  website text,
  linkedin_url text,
  timezone text,
  custom_fields jsonb not null default '{}'::jsonb check (jsonb_typeof(custom_fields) = 'object'),
  tags text[] not null default '{}',
  verification_status text not null default 'unknown'
    check (verification_status in ('unknown', 'valid', 'invalid', 'risky')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, email),
  unique (id, workspace_id)
);

create index leads_tags_idx on public.leads using gin (tags);
create index leads_workspace_created_idx on public.leads (workspace_id, created_at desc);

create trigger leads_updated_at
  before update on public.leads
  for each row execute function private.set_updated_at();

-- Suppression list (never email these addresses) -----------------------------
create table public.suppressions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email extensions.citext not null,
  reason text not null default 'manual'
    check (reason in ('unsubscribed', 'bounced', 'complained', 'manual')),
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);

-- Campaigns ---------------------------------------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'completed')),
  timezone text not null default 'UTC',
  send_days smallint[] not null default '{1,2,3,4,5}'
    check (cardinality(send_days) >= 1 and send_days <@ '{1,2,3,4,5,6,7}'::smallint[]),
  window_start time not null default '09:00',
  window_end time not null default '17:00',
  daily_limit integer not null default 50 check (daily_limit between 1 and 10000),
  track_opens boolean not null default false,
  track_clicks boolean not null default false,
  stop_on_reply boolean not null default true,
  include_unsubscribe boolean not null default true,
  started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  check (window_end > window_start)
);

create index campaigns_workspace_idx on public.campaigns (workspace_id, created_at desc);

create trigger campaigns_updated_at
  before update on public.campaigns
  for each row execute function private.set_updated_at();

-- Which inboxes a campaign sends from (inbox rotation).
create table public.campaign_email_accounts (
  campaign_id uuid not null,
  email_account_id uuid not null,
  workspace_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (campaign_id, email_account_id),
  foreign key (campaign_id, workspace_id)
    references public.campaigns (id, workspace_id) on delete cascade,
  foreign key (email_account_id, workspace_id)
    references public.email_accounts (id, workspace_id) on delete cascade
);

create index campaign_email_accounts_account_idx on public.campaign_email_accounts (email_account_id);

-- Sequence steps: step 1 email, then follow-ups after delay_days.
create table public.sequence_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  workspace_id uuid not null,
  position integer not null check (position >= 1),
  delay_days integer not null default 0 check (delay_days between 0 and 365),
  subject text not null default '',
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, position) deferrable initially deferred,
  unique (id, workspace_id),
  foreign key (campaign_id, workspace_id)
    references public.campaigns (id, workspace_id) on delete cascade
);

create trigger sequence_steps_updated_at
  before update on public.sequence_steps
  for each row execute function private.set_updated_at();

-- Campaign leads: one row per lead in a campaign, tracks progress.
create table public.campaign_leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid not null,
  lead_id uuid not null,
  status text not null default 'queued'
    check (status in ('queued', 'in_progress', 'completed', 'replied', 'bounced',
                      'unsubscribed', 'stopped', 'failed')),
  next_step integer not null default 1 check (next_step >= 1),
  next_send_at timestamptz,
  email_account_id uuid,
  thread_message_id text,
  last_message_id text,
  last_sent_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, lead_id),
  unique (id, workspace_id),
  foreign key (campaign_id, workspace_id)
    references public.campaigns (id, workspace_id) on delete cascade,
  foreign key (lead_id, workspace_id)
    references public.leads (id, workspace_id) on delete cascade,
  foreign key (email_account_id, workspace_id)
    references public.email_accounts (id, workspace_id) on delete set null (email_account_id)
);

create index campaign_leads_due_idx on public.campaign_leads (campaign_id, status, next_send_at);
create index campaign_leads_lead_idx on public.campaign_leads (lead_id);
create index campaign_leads_account_idx on public.campaign_leads (email_account_id);

create trigger campaign_leads_updated_at
  before update on public.campaign_leads
  for each row execute function private.set_updated_at();

-- Sent messages: every outgoing campaign email. id doubles as the tracking id.
-- unique (campaign_lead_id, sequence_step_id) = a step can never be sent twice.
create table public.sent_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid not null,
  campaign_lead_id uuid not null,
  sequence_step_id uuid not null,
  lead_id uuid not null,
  email_account_id uuid,
  step_position integer not null,
  message_id text not null unique,
  in_reply_to text,
  to_email extensions.citext not null,
  subject text not null default '',
  status text not null default 'sending'
    check (status in ('sending', 'sent', 'failed', 'bounced')),
  error text,
  sent_at timestamptz,
  opened_at timestamptz,
  open_count integer not null default 0,
  clicked_at timestamptz,
  click_count integer not null default 0,
  replied_at timestamptz,
  bounced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_lead_id, sequence_step_id),
  unique (id, workspace_id),
  foreign key (campaign_id, workspace_id)
    references public.campaigns (id, workspace_id) on delete cascade,
  foreign key (campaign_lead_id, workspace_id)
    references public.campaign_leads (id, workspace_id) on delete cascade,
  foreign key (sequence_step_id, workspace_id)
    references public.sequence_steps (id, workspace_id) on delete cascade,
  foreign key (lead_id, workspace_id)
    references public.leads (id, workspace_id) on delete cascade,
  foreign key (email_account_id, workspace_id)
    references public.email_accounts (id, workspace_id) on delete set null (email_account_id)
);

create index sent_messages_campaign_idx on public.sent_messages (campaign_id, sent_at desc);
create index sent_messages_account_sent_idx on public.sent_messages (email_account_id, sent_at desc);
create index sent_messages_lead_idx on public.sent_messages (lead_id);
create index sent_messages_campaign_lead_idx on public.sent_messages (campaign_lead_id);
create index sent_messages_step_idx on public.sent_messages (sequence_step_id);

-- Inbox messages (Unibox): replies and bounces read over IMAP, plus replies we send.
create table public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  email_account_id uuid not null,
  lead_id uuid,
  campaign_id uuid,
  sent_message_id uuid,
  direction text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  kind text not null default 'reply' check (kind in ('reply', 'bounce', 'auto_reply', 'other')),
  message_id text not null,
  in_reply_to text,
  references_header text,
  from_email extensions.citext not null,
  from_name text,
  to_email text,
  subject text not null default '',
  text_body text,
  html_body text,
  imap_uid bigint,
  received_at timestamptz not null default now(),
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  unique (email_account_id, message_id),
  foreign key (email_account_id, workspace_id)
    references public.email_accounts (id, workspace_id) on delete cascade,
  foreign key (lead_id, workspace_id)
    references public.leads (id, workspace_id) on delete set null (lead_id),
  foreign key (campaign_id, workspace_id)
    references public.campaigns (id, workspace_id) on delete set null (campaign_id),
  foreign key (sent_message_id, workspace_id)
    references public.sent_messages (id, workspace_id) on delete set null (sent_message_id)
);

create index inbox_messages_workspace_received_idx on public.inbox_messages (workspace_id, received_at desc);
create index inbox_messages_lead_idx on public.inbox_messages (lead_id);
create index inbox_messages_campaign_idx on public.inbox_messages (campaign_id);
create index inbox_messages_sent_message_idx on public.inbox_messages (sent_message_id);

-- Events: activity feed + stats (sent, opened, clicked, replied, bounced, unsubscribed).
create table public.events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid,
  lead_id uuid,
  sent_message_id uuid,
  type text not null
    check (type in ('sent', 'opened', 'clicked', 'replied', 'bounced', 'unsubscribed', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (campaign_id, workspace_id)
    references public.campaigns (id, workspace_id) on delete cascade,
  foreign key (lead_id, workspace_id)
    references public.leads (id, workspace_id) on delete cascade,
  foreign key (sent_message_id, workspace_id)
    references public.sent_messages (id, workspace_id) on delete set null (sent_message_id)
);

create index events_workspace_created_idx on public.events (workspace_id, created_at desc);
create index events_campaign_created_idx on public.events (campaign_id, created_at desc);
create index events_lead_idx on public.events (lead_id);
create index events_sent_message_idx on public.events (sent_message_id);

-- Row Level Security ---------------------------------------------------------------
alter table public.email_accounts enable row level security;
alter table public.email_account_secrets enable row level security;
alter table public.leads enable row level security;
alter table public.suppressions enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_email_accounts enable row level security;
alter table public.sequence_steps enable row level security;
alter table public.campaign_leads enable row level security;
alter table public.sent_messages enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.events enable row level security;

-- Secrets: server only.
revoke all on public.email_account_secrets from anon, authenticated;

-- Full CRUD for workspace members on user-managed tables.
do $$
declare
  t text;
begin
  foreach t in array array[
    'email_accounts', 'leads', 'suppressions', 'campaigns',
    'campaign_email_accounts', 'sequence_steps', 'campaign_leads'
  ]
  loop
    execute format(
      'create policy "members can view" on public.%I for select to authenticated
         using (workspace_id in (select private.user_workspace_ids()))', t);
    execute format(
      'create policy "members can insert" on public.%I for insert to authenticated
         with check (workspace_id in (select private.user_workspace_ids()))', t);
    execute format(
      'create policy "members can update" on public.%I for update to authenticated
         using (workspace_id in (select private.user_workspace_ids()))
         with check (workspace_id in (select private.user_workspace_ids()))', t);
    execute format(
      'create policy "members can delete" on public.%I for delete to authenticated
         using (workspace_id in (select private.user_workspace_ids()))', t);
  end loop;
end;
$$;

-- Written by the server only; members can read.
create policy "members can view" on public.sent_messages for select to authenticated
  using (workspace_id in (select private.user_workspace_ids()));

create policy "members can view" on public.events for select to authenticated
  using (workspace_id in (select private.user_workspace_ids()));

create policy "members can view" on public.inbox_messages for select to authenticated
  using (workspace_id in (select private.user_workspace_ids()));

-- Members can mark inbox messages read/unread (only that column).
revoke update on public.inbox_messages from authenticated;
grant update (is_read) on public.inbox_messages to authenticated;

create policy "members can update" on public.inbox_messages for update to authenticated
  using (workspace_id in (select private.user_workspace_ids()))
  with check (workspace_id in (select private.user_workspace_ids()));
