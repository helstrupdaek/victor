-- PostgREST always builds INSERT/UPSERT as an internal `... RETURNING *` CTE,
-- even when the client doesn't request the row back. Under RLS that RETURNING
-- requires a SELECT policy — but anon intentionally has none on `guests` (see
-- 0001_init.sql), so every anon upsert was being rejected as an RLS
-- violation. A security-definer RPC does the write as the function owner
-- (bypassing RLS for that write) while the table itself stays unreadable to
-- anon, so the guest list is still never exposed.
create or replace function public.submit_rsvp(
  p_name text,
  p_email text,
  p_attending boolean,
  p_adults_count int,
  p_children_count int,
  p_attendee_names text[],
  p_allergies text default null,
  p_comment text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.guests
    (name, email, attending, adults_count, children_count, attendee_names, allergies, comment)
  values
    (trim(p_name), lower(trim(p_email)), p_attending, p_adults_count, p_children_count,
     p_attendee_names, p_allergies, p_comment)
  on conflict (email) do update set
    name = excluded.name,
    attending = excluded.attending,
    adults_count = excluded.adults_count,
    children_count = excluded.children_count,
    attendee_names = excluded.attendee_names,
    allergies = excluded.allergies,
    comment = excluded.comment,
    updated_at = now();
end;
$$;

grant execute on function public.submit_rsvp(
  text, text, boolean, int, int, text[], text, text
) to anon;
