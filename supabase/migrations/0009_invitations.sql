-- Personal invitations, sent from the Invitationer tab in /admin by SMS
-- (SureSMS) and/or email (Resend). Each row has a short token for the
-- guest's own link, /i/<token>, which opens the envelope and prefills
-- Tilmelding with their name and email.
--
-- IDEMPOTENT like 0005/0006: safe to run again.

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text,
  phone text,
  -- 12 hex chars (48 bits): short enough to keep the SMS to one message,
  -- too many to guess.
  token text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  email_sent_at timestamptz,
  sms_sent_at timestamptz,
  opened_at timestamptz
);

alter table public.invitations enable row level security;

-- No anon policies: the guest list is admin-only. Guests reach their own row
-- only through get_invitation below, one token at a time.
drop policy if exists "invitations_admin_all" on public.invitations;
create policy "invitations_admin_all" on public.invitations
  for all to authenticated
  using (true)
  with check (true);

-- Returns name + email for one token and stamps the first opening.
create or replace function public.get_invitation(p_token text)
returns table (name text, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invitations i set opened_at = now()
    where i.token = p_token and i.opened_at is null;
  return query select i.name, i.email from public.invitations i where i.token = p_token;
end;
$$;

grant execute on function public.get_invitation(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- SELF-VERIFICATION. A successful run prints t | t | t | t
select
  exists (select 1 from information_schema.tables
          where table_schema = 'public' and table_name = 'invitations') as has_table,
  (select relrowsecurity from pg_class where oid = 'public.invitations'::regclass) as rls_enabled,
  exists (select 1 from pg_policies where schemaname = 'public'
          and tablename = 'invitations' and policyname = 'invitations_admin_all') as admin_policy,
  exists (select 1 from pg_proc where proname = 'get_invitation') as has_rpc;
