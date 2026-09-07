-- A shared to-do list for the hosts, under the To-do tab in /admin.
--
-- Its own table rather than a JSON blob in site_settings: two people will be
-- ticking things off from two phones, and a blob would let one save overwrite
-- the other's tick. Row-level writes do not have that problem.
--
-- IDEMPOTENT, like 0005: the SQL editor runs the file as one transaction, so
-- an error anywhere rolls the whole thing back while still reporting success
-- for the batch. Every statement is guarded so the file can be run again.

create table if not exists public.admin_todos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  done boolean not null default false,
  done_at timestamptz,
  -- Email of whoever added / ticked it. Free text rather than a foreign key
  -- to auth.users so a row survives an account being deleted.
  created_by text,
  done_by text
);

alter table public.admin_todos enable row level security;

-- Deliberately no anon policies. Only a signed-in admin can read or write.
drop policy if exists "admin_todos_admin_all" on public.admin_todos;
create policy "admin_todos_admin_all" on public.admin_todos
  for all to authenticated
  using (true)
  with check (true);

notify pgrst, 'reload schema';

-- SELF-VERIFICATION, same reasoning as 0005. A successful run prints
--
--   has_table | rls_enabled | admin_policy
--   ----------+-------------+-------------
--   t         | t           | t
select
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'admin_todos'
  ) as has_table,
  (
    select relrowsecurity from pg_class
    where oid = 'public.admin_todos'::regclass
  ) as rls_enabled,
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'admin_todos'
      and policyname = 'admin_todos_admin_all'
  ) as admin_policy;
