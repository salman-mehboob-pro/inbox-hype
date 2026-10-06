-- Covering indexes for the composite (parent_id, workspace_id) foreign keys.
-- Replaces the single-column indexes that only covered parent_id.

drop index if exists public.campaign_email_accounts_account_idx;
drop index if exists public.campaign_leads_lead_idx;
drop index if exists public.campaign_leads_account_idx;
drop index if exists public.sent_messages_lead_idx;
drop index if exists public.sent_messages_campaign_lead_idx;
drop index if exists public.sent_messages_step_idx;
drop index if exists public.inbox_messages_lead_idx;
drop index if exists public.inbox_messages_campaign_idx;
drop index if exists public.inbox_messages_sent_message_idx;
drop index if exists public.events_lead_idx;
drop index if exists public.events_sent_message_idx;

create index campaign_email_accounts_campaign_ws_idx on public.campaign_email_accounts (campaign_id, workspace_id);
create index campaign_email_accounts_account_ws_idx on public.campaign_email_accounts (email_account_id, workspace_id);

create index sequence_steps_campaign_ws_idx on public.sequence_steps (campaign_id, workspace_id);

create index campaign_leads_campaign_ws_idx on public.campaign_leads (campaign_id, workspace_id);
create index campaign_leads_lead_ws_idx on public.campaign_leads (lead_id, workspace_id);
create index campaign_leads_account_ws_idx on public.campaign_leads (email_account_id, workspace_id);

create index sent_messages_campaign_ws_idx on public.sent_messages (campaign_id, workspace_id);
create index sent_messages_campaign_lead_ws_idx on public.sent_messages (campaign_lead_id, workspace_id);
create index sent_messages_step_ws_idx on public.sent_messages (sequence_step_id, workspace_id);
create index sent_messages_lead_ws_idx on public.sent_messages (lead_id, workspace_id);
create index sent_messages_account_ws_idx on public.sent_messages (email_account_id, workspace_id);

create index inbox_messages_account_ws_idx on public.inbox_messages (email_account_id, workspace_id);
create index inbox_messages_lead_ws_idx on public.inbox_messages (lead_id, workspace_id);
create index inbox_messages_campaign_ws_idx on public.inbox_messages (campaign_id, workspace_id);
create index inbox_messages_sent_message_ws_idx on public.inbox_messages (sent_message_id, workspace_id);

create index events_campaign_ws_idx on public.events (campaign_id, workspace_id);
create index events_lead_ws_idx on public.events (lead_id, workspace_id);
create index events_sent_message_ws_idx on public.events (sent_message_id, workspace_id);
