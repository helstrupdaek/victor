-- Free-text player names for the minigolf leaderboard.
--
-- The board was keyed on guest_email and derived a display name from the local
-- part of the address, which meant only invited guests could post a score and
-- everyone showed up as "firstname.lastname". At a party the game gets passed
-- around — siblings, friends, whoever picks up the phone — so identity is now
-- just a name the player types.
--
-- guest_email is kept and made nullable rather than dropped: existing rows keep
-- their provenance, and a score submitted from a device that knows the guest's
-- address can still record it.
--
-- IDEMPOTENT AND ORDER-SAFE. The first version of this migration dropped the
-- unique constraint by its assumed name, `minigolf_scores_guest_email_key`. If
-- Postgres had named it anything else that statement errors, and because the
-- SQL editor runs the file as one batch the whole migration rolls back — which
-- is what happened: PostgREST still reported the old columns afterwards. Every
-- step below is now guarded, so this can be run repeatedly and will apply
-- whatever is still missing rather than aborting.

alter table public.minigolf_scores
  add column if not exists player_name text;

-- Backfill from the old derived display name so existing rows keep working.
update public.minigolf_scores
  set player_name = split_part(guest_email, '@', 1)
  where player_name is null
    and guest_email is not null;

-- Anything still null (shouldn't exist, but don't let it block the NOT NULL).
update public.minigolf_scores
  set player_name = 'Spiller ' || left(id::text, 4)
  where player_name is null;

alter table public.minigolf_scores
  alter column player_name set not null;

alter table public.minigolf_scores
  alter column guest_email drop not null;

-- Drop the old unique constraint on guest_email WHATEVER it is called: look it
-- up in the catalog rather than assuming a name.
do $$
declare
  con_name text;
begin
  select c.conname into con_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'minigolf_scores'
    and c.contype = 'u'
    and (select array_agg(a.attname order by a.attnum)
         from unnest(c.conkey) k
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k) = array['guest_email'];
  if con_name is not null then
    execute format('alter table public.minigolf_scores drop constraint %I', con_name);
  end if;
end $$;

-- The unique key moves to the name. One best round per player, same as before,
-- but now "best round for this name" rather than "for this email".
create unique index if not exists minigolf_scores_player_name_key
  on public.minigolf_scores (lower(player_name));

-- Bust PostgREST's schema cache so the API sees the new column immediately
-- instead of after its next reload.
notify pgrst, 'reload schema';
