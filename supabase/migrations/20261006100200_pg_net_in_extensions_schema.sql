-- pg_net was created in the public schema by the sending_tick migration
-- (Supabase security check: "extension in public"). Recreate it in `extensions`.
drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;
