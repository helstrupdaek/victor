create table public.minigolf_scores (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  guest_email text not null unique,
  shots int not null,
  -- double precision, not numeric: PostgREST/supabase-js return `numeric`
  -- columns as strings (to avoid float precision loss on arbitrary-
  -- precision decimals), which would silently break every `.toFixed()`
  -- call on these fields in the frontend. There's no need for
  -- arbitrary-precision accuracy on a shot timer, so plain floats avoid
  -- the whole class of bug.
  seconds double precision not null,
  score double precision not null
);

alter table public.minigolf_scores enable row level security;

-- Deliberately no anon policies: the public leaderboard and score
-- submission are served through service-role API routes (see
-- api/minigolf/submit-score.ts and api/minigolf/leaderboard.ts), never a
-- direct anon query, so there is no anon RLS surface on this table.

create policy "minigolf_admin_all" on public.minigolf_scores
  for all to authenticated
  using (true)
  with check (true);
