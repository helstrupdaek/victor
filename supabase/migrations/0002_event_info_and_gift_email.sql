-- Victor's konfirmation — event info + guest/gift linkage
-- Additive migration: does not touch existing tables/policies beyond what's
-- listed below. Run after 0001_init.sql.

-- ---------------------------------------------------------------------------
-- Associate a gift reservation with the guest who made it, by email, so an
-- RSVP confirmation (on-site and by email) can show "your reserved gifts".
-- Nullable: a reservation can still be made without an email (e.g. a
-- grandparent who isn't RSVPing themselves) — "connected where possible",
-- per spec, not required.
-- ---------------------------------------------------------------------------
alter table public.gift_reservations
  add column if not exists guest_email text;

create index if not exists gift_reservations_guest_email_idx
  on public.gift_reservations (lower(guest_email));

-- Anyone reserving a gift may already set guest_email (covered by the
-- existing "reservations_public_insert" with check (true) policy — no new
-- policy needed for INSERT).

-- Lets a guest fetch *their own* reserved gift titles by email, without
-- granting broad SELECT on gift_reservations (which stays admin-only) —
-- this is what keeps "never publicly display who reserved a gift" true
-- while still letting the reserving guest see their own summary.
create or replace function public.get_wishlist_titles_by_email(p_email text)
returns table (title text) as $$
  select wi.title
  from public.gift_reservations gr
  join public.wishlist_items wi on wi.id = gr.wishlist_item_id
  where p_email is not null
    and gr.guest_email is not null
    and lower(gr.guest_email) = lower(p_email)
  order by wi.sort_order;
$$ language sql stable security definer set search_path = public;

grant execute on function public.get_wishlist_titles_by_email(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Real event details (was placeholder/generic in 0001). Editable from
-- /admin afterwards — this seed just gets the site correct on day one.
-- ---------------------------------------------------------------------------
insert into public.site_settings (key, value, is_public) values
  ('event_info', '{
    "eventDate": "2027-05-01",
    "churchName": "Sct. Mortens Kirke",
    "churchCity": "Randers",
    "churchAddress": null,
    "churchStartTime": null,
    "churchEndTime": null,
    "partyAddressLine1": "Verdisvej 9",
    "partyPostalCode": "8920",
    "partyCity": "Randers NV",
    "rsvpDeadline": "2026-12-01",
    "hosts": "Mark, Malene & Victor",
    "invitationBody": "Den 1. maj 2027 er en helt særlig dag for Victor, og vi håber, at I har lyst til at fejre den sammen med os.\n\nVictor bliver konfirmeret i Sct. Mortens Kirke i Randers, og bagefter fortsætter vi festen hjemme hos os på Verdisvej 9, hvor vi dækker op til fest i haven.\n\nVi glæder os til en dag med god mad, kolde drikke og de mennesker, Victor holder af."
  }'::jsonb, true)
on conflict (key) do update set
  value = excluded.value,
  is_public = excluded.is_public,
  updated_at = now();

update public.site_settings
  set value = '{"lat": 56.47, "lon": 10.02, "label": "Randers NV"}'::jsonb,
      updated_at = now()
  where key = 'venue_location';

update public.site_settings
  set value = '[
    {"id":"adresse","title":"Adresse","body":"Verdisvej 9\n8920 Randers NV","icon":"map-pin"},
    {"id":"parkering","title":"Parkering","body":"PLACEHOLDER: Der er parkering på og omkring vejen.","icon":"car"},
    {"id":"paaklaedning","title":"Påklædning","body":"PLACEHOLDER: Pænt tøj / festtøj.","icon":"shirt"},
    {"id":"lokation","title":"Festen foregår i haven","body":"Efter kirken fortsætter vi festen i haven på Verdisvej 9, Randers NV.","icon":"tent"},
    {"id":"kontakt","title":"Kontakt","body":"PLACEHOLDER: Navn, telefon eller email.","icon":"phone"},
    {"id":"overnatning","title":"Overnatningsmuligheder","body":"PLACEHOLDER: Nærmeste hotel/B&B, hvis relevant.","icon":"bed"}
  ]'::jsonb,
      updated_at = now()
  where key = 'practical_info';
