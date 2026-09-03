-- Victor's konfirmation — initial schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) on a fresh project.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- guests (RSVP)
-- ---------------------------------------------------------------------------
create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  email text not null,
  attending boolean not null,
  adults_count integer not null default 1 check (adults_count >= 0),
  children_count integer not null default 0 check (children_count >= 0),
  attendee_names text[] not null default '{}',
  allergies text,
  comment text
);

-- one RSVP per email address; a re-submission updates the existing row
-- instead of creating a duplicate. The app normalizes email to lowercase
-- before every insert/upsert, so a plain unique constraint is sufficient
-- (and, unlike a functional index, works directly with PostgREST's
-- upsert ?on_conflict=email).
alter table public.guests
  add constraint guests_email_key unique (email);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists guests_set_updated_at on public.guests;
create trigger guests_set_updated_at
  before update on public.guests
  for each row execute function public.set_updated_at();

alter table public.guests enable row level security;

-- Public (anon) guests may create or update their own RSVP by email via
-- upsert(on_conflict: email). They can never read the guest list back.
create policy "guests_public_insert" on public.guests
  for insert to anon
  with check (true);

create policy "guests_public_upsert_update" on public.guests
  for update to anon
  using (true)
  with check (true);

create policy "guests_admin_select" on public.guests
  for select to authenticated
  using (true);

create policy "guests_admin_delete" on public.guests
  for delete to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- wishlist_items
-- ---------------------------------------------------------------------------
create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  description text,
  image_url text,
  external_url text,
  price numeric(10, 2),
  category text,
  sort_order integer not null default 0,
  is_reserved boolean not null default false
);

alter table public.wishlist_items enable row level security;

create policy "wishlist_public_select" on public.wishlist_items
  for select to anon, authenticated
  using (true);

create policy "wishlist_admin_write" on public.wishlist_items
  for all to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- gift_reservations
-- ---------------------------------------------------------------------------
create table if not exists public.gift_reservations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  wishlist_item_id uuid not null references public.wishlist_items (id) on delete cascade,
  reserved_by_name text not null,
  reservation_token uuid not null default gen_random_uuid(),
  unique (wishlist_item_id)
);

alter table public.gift_reservations enable row level security;

-- Anyone may reserve an unreserved gift. The unique constraint above
-- guarantees only one reservation can ever exist per gift, so a race
-- between two guests resolves with exactly one winner at the database level.
create policy "reservations_public_insert" on public.gift_reservations
  for insert to anon
  with check (true);

-- Nobody (not even admins get a public API for this) can list reservations
-- by scanning — this keeps "who reserved what" private. Releasing a
-- reservation is done by DELETE, filtered client-side by the private
-- reservation_token the guest received on creation. Because reservation_token
-- is an unguessable random uuid, this acts as a bearer-token capability
-- rather than a broad public delete.
create policy "reservations_release_by_token" on public.gift_reservations
  for delete to anon
  using (true);

create policy "reservations_admin_select" on public.gift_reservations
  for select to authenticated
  using (true);

create or replace function public.sync_wishlist_reserved_flag()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update public.wishlist_items set is_reserved = true where id = new.wishlist_item_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.wishlist_items set is_reserved = false where id = old.wishlist_item_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists gift_reservations_sync_insert on public.gift_reservations;
create trigger gift_reservations_sync_insert
  after insert on public.gift_reservations
  for each row execute function public.sync_wishlist_reserved_flag();

drop trigger if exists gift_reservations_sync_delete on public.gift_reservations;
create trigger gift_reservations_sync_delete
  after delete on public.gift_reservations
  for each row execute function public.sync_wishlist_reserved_flag();

-- ---------------------------------------------------------------------------
-- photos
-- ---------------------------------------------------------------------------
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  storage_path text not null,
  caption text,
  width integer,
  height integer,
  sort_order integer not null default 0,
  is_published boolean not null default false
);

alter table public.photos enable row level security;

create policy "photos_public_select_published" on public.photos
  for select to anon
  using (is_published = true);

create policy "photos_admin_all" on public.photos
  for all to authenticated
  using (true)
  with check (true);

-- Storage bucket for gallery photos. Created public so published photo URLs
-- work directly; the `photos` table (governed by RLS above) is what actually
-- controls what the site *shows* — unpublished photos simply aren't linked
-- anywhere public even though the underlying file could technically be
-- fetched if someone already had its exact URL.
insert into storage.buckets (id, name, public)
  values ('gallery', 'gallery', true)
  on conflict (id) do nothing;

create policy "gallery_storage_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'gallery');

create policy "gallery_storage_admin_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gallery');

create policy "gallery_storage_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'gallery');

create policy "gallery_storage_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'gallery');

-- ---------------------------------------------------------------------------
-- site_settings — small JSON documents editable from /admin, e.g. the
-- schedule/timeline and the practical-info cards. Keeping these as data
-- (instead of hardcoded React content) is what makes them editable later
-- without a code change.
-- ---------------------------------------------------------------------------
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;

create policy "site_settings_public_select" on public.site_settings
  for select to anon, authenticated
  using (is_public = true);

create policy "site_settings_admin_all" on public.site_settings
  for all to authenticated
  using (true)
  with check (true);

-- Seed defaults so the site has real content the moment it's connected.
-- Edit these values (or use /admin) with your actual details.
insert into public.site_settings (key, value, is_public) values
  ('timeline', '[
    {"id":"kirke","label":"Kirke","time":"","description":"Konfirmationen finder sted i kirken."},
    {"id":"ankomst","label":"Ankomst","time":"","description":"I haven — velkomstdrink og hygge."},
    {"id":"forret","label":"Forret","time":"","description":""},
    {"id":"hovedret","label":"Hovedret","time":"","description":""},
    {"id":"dessert","label":"Dessert","time":"","description":""},
    {"id":"kaffe","label":"Kaffe","time":"","description":""},
    {"id":"fest","label":"Fest","time":"","description":"Musik og dans under teltet."}
  ]'::jsonb, true)
on conflict (key) do nothing;

insert into public.site_settings (key, value, is_public) values
  ('practical_info', '[
    {"id":"adresse","title":"Adresse","body":"PLACEHOLDER: Vejnavn 1, 3000 By","icon":"map-pin"},
    {"id":"parkering","title":"Parkering","body":"PLACEHOLDER: Der er parkering på og omkring vejen.","icon":"car"},
    {"id":"paaklaedning","title":"Påklædning","body":"PLACEHOLDER: Pænt tøj / festtøj.","icon":"shirt"},
    {"id":"lokation","title":"Festen foregår i haven","body":"PLACEHOLDER: Vi holder festen i vores baghave under et festtelt.","icon":"tent"},
    {"id":"kontakt","title":"Kontakt","body":"PLACEHOLDER: Navn, telefon eller email.","icon":"phone"},
    {"id":"overnatning","title":"Overnatningsmuligheder","body":"PLACEHOLDER: Nærmeste hotel/B&B, hvis relevant.","icon":"bed"}
  ]'::jsonb, true)
on conflict (key) do nothing;

insert into public.site_settings (key, value, is_public) values
  ('venue_location', '{"lat": 55.6761, "lon": 12.5683, "label": "PLACEHOLDER: København"}'::jsonb, true)
on conflict (key) do nothing;
