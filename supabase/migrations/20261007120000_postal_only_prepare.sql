-- Postal-only, step 1 of 2. Safe for both the old app code (still live until
-- the next push) and the new Postal-only code:
--   - new inboxes are Postal by default (the new code no longer sends `provider`)
--   - the API key gets its own column `api_key_enc`; until step 2 it is kept in
--     sync with the old `smtp_password_enc` (the old code still writes that one)
-- Step 2 (postal_only_cleanup) drops all SMTP / IMAP columns after the push.

alter table public.email_accounts alter column provider set default 'postal';

alter table public.email_account_secrets
  add column api_key_enc text,
  alter column smtp_password_enc drop not null;

update public.email_account_secrets set api_key_enc = smtp_password_enc where api_key_enc is null;

create or replace function private.sync_api_key_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.api_key_enc := coalesce(new.api_key_enc, new.smtp_password_enc);
    new.smtp_password_enc := coalesce(new.smtp_password_enc, new.api_key_enc);
  elsif new.smtp_password_enc is distinct from old.smtp_password_enc then
    new.api_key_enc := new.smtp_password_enc;
  elsif new.api_key_enc is distinct from old.api_key_enc then
    new.smtp_password_enc := new.api_key_enc;
  end if;
  return new;
end;
$$;

create trigger email_account_secrets_sync_api_key
  before insert or update on public.email_account_secrets
  for each row execute function private.sync_api_key_columns();
