-- Public reads of public.photos should never include uploader_hash: it is an
-- HMAC of the uploading guest's IP, kept only so /api/photos/guest can rate
-- limit one phone, never meant to be public. Row-level security already
-- restricts anon to published rows (0001's photos_public_select_published),
-- but RLS says nothing about columns — a stray select('*') on the client
-- would have handed uploader_hash to every visitor. The client now names its
-- columns explicitly (src/lib/api/photos.ts), and this migration makes the
-- database itself refuse anon a wider read even if that ever regresses.
--
-- IDEMPOTENT, like 0005-0007: the SQL editor runs the file as one
-- transaction and reports success for the batch even when a statement failed
-- and rolled everything back. Every statement is guarded so the file can be
-- run again, and it ends by checking what it did.

revoke select on public.photos from anon;

grant select (
  id, created_at, storage_path, caption, width, height, sort_order,
  is_published, source, guest_name, is_pinned
) on public.photos to anon;

notify pgrst, 'reload schema';

-- SELF-VERIFICATION. A successful run raises no exception.
do $$
begin
  if exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'photos'
      and grantee = 'anon' and column_name = 'uploader_hash' and privilege_type = 'SELECT'
  ) then
    raise exception '0008 failed: anon can still select uploader_hash';
  end if;
  if not exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'photos'
      and grantee = 'anon' and column_name = 'id' and privilege_type = 'SELECT'
  ) then
    raise exception '0008 failed: anon lost select on id';
  end if;
end $$;
