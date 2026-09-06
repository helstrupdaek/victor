-- Free-text player names for the minigolf leaderboard.
--
-- The board was keyed on guest_email and derived a display name from the
-- local part of the address, which meant only invited guests could post a
-- score and everyone showed up as "firstname.lastname". At a party the game
-- gets passed around — siblings, friends, whoever picks up the phone — so
-- identity is now just a name the player types.
--
-- guest_email is kept and made nullable rather than dropped: existing rows
-- keep their provenance, and a score submitted from a device that knows the
-- guest's address can still record it.

alter table public.minigolf_scores
  add column player_name text;

-- Backfill from the old derived display name so existing rows keep working.
update public.minigolf_scores
  set player_name = split_part(guest_email, '@', 1)
  where player_name is null;

alter table public.minigolf_scores
  alter column player_name set not null;

alter table public.minigolf_scores
  alter column guest_email drop not null;

-- The unique key moves to the name. One best round per player, same as before,
-- but now "best round for this name" rather than "for this email".
alter table public.minigolf_scores
  drop constraint minigolf_scores_guest_email_key;

create unique index minigolf_scores_player_name_key
  on public.minigolf_scores (lower(player_name));
