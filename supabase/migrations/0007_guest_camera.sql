-- Guest camera: guests upload photos from their phones through
-- /api/photos/guest, and the hosts control the wall from /admin.
--
-- IDEMPOTENT, like 0005 and 0006: the SQL editor runs the file as one
-- transaction and reports success for the batch even when a statement failed
-- and rolled everything back. Every statement is guarded so the file can be
-- run again, and it ends by printing what it did.

alter table public.photos
  add column if not exists source text not null default 'admin',
  add column if not exists guest_name text,
  add column if not exists is_pinned boolean not null default false,
  -- HMAC of the uploading IP, for the per-phone rate limit. Never shown,
  -- not reversible. See api/photos/guest.ts.
  add column if not exists uploader_hash text;

-- Guarded separately: `add column if not exists` skips the check when the
-- column already exists, so it cannot be relied on to add the constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'photos_source_check'
  ) then
    alter table public.photos
      add constraint photos_source_check check (source in ('admin', 'guest'));
  end if;
end $$;

-- The rate limit counts recent rows per hash; this is the index it uses.
create index if not exists photos_uploader_hash_created_at_idx
  on public.photos (uploader_hash, created_at desc)
  where uploader_hash is not null;

-- Both public: /kamera and Billeder read them with the anon key, through the
-- existing site_settings_public_select policy.
insert into public.site_settings (key, value, is_public) values
  ('guest_camera', '{"enabled": false}', true),
  ('gallery_order', '{"direction": "newest"}', true)
on conflict (key) do nothing;

notify pgrst, 'reload schema';

-- SELF-VERIFICATION. A successful run prints
--
--   has_source | has_pinned | has_switch | has_order
--   -----------+------------+------------+----------
--   t          | t          | t          | t
select
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'photos' and column_name = 'source') as has_source,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'photos' and column_name = 'is_pinned') as has_pinned,
  exists (select 1 from public.site_settings where key = 'guest_camera') as has_switch,
  exists (select 1 from public.site_settings where key = 'gallery_order') as has_order;
