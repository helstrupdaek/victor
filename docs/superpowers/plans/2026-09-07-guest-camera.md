# Guest Camera and Polaroid Wall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guests scan a QR code, their phone's camera opens, the photo lands on Billeder as a polaroid within seconds, they can write a line under it, and the hosts switch it on/off, pin, and order from /admin.

**Architecture:** A `/kamera` route resizes the photo on the phone and posts the raw JPEG to a service-key Vercel function that enforces the on/off switch, validates, rate-limits per hashed IP, and writes to the existing `gallery` bucket and `photos` table. Billeder replaces its grid with a polaroid wall that polls while the camera is on. The admin Gallery tab gains the switch, order, QR download, pin, inline text edit, and bulk guest delete.

**Tech Stack:** React 19 + Vite 8 + Tailwind v4 (existing), Supabase (Postgres + Storage, existing), Vercel Node functions (existing pattern in `api/minigolf/*`), `qrcode` (new, the only new dependency), `node --test` for pure logic (Node 23 runs `.ts` directly), headless Chrome over CDP for browser suites (existing pattern in `.superpowers/sdd/2026-09-03-minigolf/*.mjs`).

**Spec:** `docs/superpowers/specs/2026-09-07-guest-camera-design.md`

## Global Constraints

Copied from the spec's "Numbers, all in one place" and section 3. Every task's requirements include these.

- Max long side after phone resize: **2000 px**; JPEG quality **0.85**
- Server body cap: **4 MB** (4 194 304 bytes) → `413`
- Accepted content types: `image/jpeg`, `image/png`, `image/webp` → otherwise `415`
- Caption max **120** chars; guest name max **30** chars; sanitised: control chars stripped, whitespace collapsed, trimmed; empty → `null`
- Rate limit: **20** uploads per hashed IP per **10 minutes** → `429`
- Switch off → `403 { ok:false, error:'Kameraet er slukket.' }`, enforced in the route
- Wall order: `is_pinned desc, created_at asc|desc` from `site_settings.gallery_order.direction`
- Wall refresh while on: every **15 s**, only when the section is in view; none when off
- Tilt: **±4°**, offset **±6 px**, deterministic per photo id
- QR encodes `<origin>/kamera`; download PNG **1024 px**
- All API errors: `{ ok:false, error:<Danish sentence> }`; the UI shows that sentence, never a raw error
- API files use explicit `.js` extensions on relative imports (Vercel's ESM loader requires it — see commit 1867494)
- Copy in Danish, no em dashes in guest-facing text (house rule from the copy pass)
- Commit after every task with the `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` trailer

**Repo facts the tasks rely on:**
- `api/_lib/http.ts` exports `readJsonBody`, `sendJson(res, status, data)`, `getQueryParam`
- `api/_lib/supabaseAdmin.ts` exports `getSupabaseAdmin()` (service-role client)
- Locally, `/api/*` runs through the Vite plugin in `vite.config.ts`: the handler gets a raw Node `IncomingMessage` (stream body) with `req.query` set. On Vercel, `req.body` is pre-parsed: a `Buffer` for binary content types, an object for JSON.
- `src/lib/api/siteSettings.ts` exports `fetchSiteSetting<T>(key, fallback)` (anon-readable when `is_public`) and `updateSiteSetting<T>(key, value)` (writes `is_public: true`, admin only)
- `src/hooks/useInViewport.ts` exports `useInViewport<T>(options)` → `{ ref, isVisible }`
- `src/hooks/useAdminSession.ts` exports `useAdminSession()` → `{ session, isLoading }`
- `src/components/Button.tsx`: `<Button variant="primary"|"outline"|"ghost">`; `src/components/FormControls.tsx`: `Input`, `Label`, `Textarea`
- `Photo` type is in `src/types/index.ts` at the `export interface Photo {` block
- RLS: anon may `select` photos where `is_published = true` (policy `photos_public_select_published`); `authenticated` has all on `photos`; the `gallery` bucket is public-read, authenticated-write. Guest writes go through the route only.
- Pure-logic tests: `node --disable-warning=ExperimentalWarning --test <file>.test.ts` on this machine (Node 23.7 strips types; without the flag it prints an ExperimentalWarning on every run, which fails the pristine-output rule). Test files must import with **relative paths** and must not import anything that uses the `@/` alias, `import.meta.env`, or the DOM.
- Browser suites live in `.superpowers/sdd/2026-09-03-minigolf/` (gitignored). Read `verify_punt_and_drag.mjs` lines 15–66 for the CDP boilerplate every suite here copies.

---

### Task 1: Migration 0007

**Files:**
- Create: `supabase/migrations/0007_guest_camera.sql`

**Interfaces:**
- Produces: columns `photos.source`, `photos.guest_name`, `photos.is_pinned`, `photos.uploader_hash`; settings rows `guest_camera`, `gallery_order`. Every later task assumes these exist.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Ask the owner to run it in Supabase**

The migration cannot be applied from this machine (no psql, no Supabase CLI; the service key only reaches PostgREST). Stop and ask the owner to paste **the SQL file from Step 1, and nothing else,** into the Supabase SQL editor, run it, and report the four-column result.

- [ ] **Step 3: Verify from the repo (terminal, NOT the SQL editor)**

This block is a shell command run from the repo directory on this machine. It is not SQL and must never be pasted into Supabase — pasting it there fails with `syntax error at or near "export"`, which happened once. It must print `HTTP 200` (PostgREST returns 400 for a column it does not know, so 200 on this select proves the columns exist) and both settings rows:

```bash
export $(grep -E '^(VITE_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' .env | xargs)
curl -s "$VITE_SUPABASE_URL/rest/v1/photos?select=id,source,is_pinned,guest_name&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -w "\nHTTP %{http_code}\n"
curl -s "$VITE_SUPABASE_URL/rest/v1/site_settings?select=key,value&key=in.(guest_camera,gallery_order)" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: `HTTP 200`, and both settings rows present with `enabled: false` and `direction: "newest"`. An empty `[]` for the photos query is fine: it means there are no photos yet, not that the columns are missing.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0007_guest_camera.sql
git commit -m "Add migration 0007: guest camera columns and settings

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Photo type, ordering, and admin helpers

**Files:**
- Modify: `src/types/index.ts` (the `export interface Photo {` block)
- Modify: `src/lib/api/photos.ts`
- Create: `src/lib/api/guestCameraSettings.ts`

**Interfaces:**
- Produces:
  - `Photo` gains `source: 'admin' | 'guest'`, `guest_name: string | null`, `is_pinned: boolean`
  - `type GalleryDirection = 'newest' | 'oldest'`
  - `fetchPublishedPhotos(direction?: GalleryDirection): Promise<Photo[]>` (ordered pinned-first then by direction)
  - `setPhotoPinned(id: string, pinned: boolean): Promise<void>`
  - `updatePhotoText(id: string, text: { caption: string | null; guest_name: string | null }): Promise<void>`
  - `deleteAllGuestPhotos(): Promise<number>` (returns how many were removed)
  - `fetchGuestCameraEnabled(): Promise<boolean>`, `setGuestCameraEnabled(enabled: boolean): Promise<void>`
  - `fetchGalleryOrder(): Promise<GalleryDirection>`, `setGalleryOrder(direction: GalleryDirection): Promise<void>`

- [ ] **Step 1: Extend the `Photo` type**

In `src/types/index.ts`, replace the `Photo` interface with:

```ts
export interface Photo {
  id: string
  created_at: string
  storage_path: string
  caption: string | null
  width: number | null
  height: number | null
  sort_order: number
  is_published: boolean
  /** 'guest' when it came in through /kamera; 'admin' when uploaded from /admin. */
  source: 'admin' | 'guest'
  /** Optional first name the guest typed under their photo. */
  guest_name: string | null
  /** Pinned photos go to the front of the wall, whatever the order setting. */
  is_pinned: boolean
  url: string
}

export type GalleryDirection = 'newest' | 'oldest'
```

- [ ] **Step 2: Write the settings helpers**

Create `src/lib/api/guestCameraSettings.ts`:

```ts
import { fetchSiteSetting, updateSiteSetting } from '@/lib/api/siteSettings'
import type { GalleryDirection } from '@/types'

/**
 * The two site_settings rows behind the guest camera. Both are public, so the
 * anon client on /kamera and Billeder can read them; writes go through
 * updateSiteSetting, which is admin-only under RLS.
 *
 * Reading is deliberately forgiving: a missing or malformed row means "off"
 * and "newest", never an exception, because these are read on the public
 * site where the right failure mode is the safe default.
 */

interface GuestCameraSetting { enabled: boolean }
interface GalleryOrderSetting { direction: GalleryDirection }

export async function fetchGuestCameraEnabled(): Promise<boolean> {
  const value = await fetchSiteSetting<GuestCameraSetting>('guest_camera', { enabled: false })
  return value?.enabled === true
}

export function setGuestCameraEnabled(enabled: boolean): Promise<void> {
  return updateSiteSetting<GuestCameraSetting>('guest_camera', { enabled })
}

export async function fetchGalleryOrder(): Promise<GalleryDirection> {
  const value = await fetchSiteSetting<GalleryOrderSetting>('gallery_order', { direction: 'newest' })
  return value?.direction === 'oldest' ? 'oldest' : 'newest'
}

export function setGalleryOrder(direction: GalleryDirection): Promise<void> {
  return updateSiteSetting<GalleryOrderSetting>('gallery_order', { direction })
}
```

- [ ] **Step 3: Update `photos.ts` — ordering and the four new helpers**

In `src/lib/api/photos.ts`, change the import line and replace `fetchPublishedPhotos` with:

```ts
import type { GalleryDirection, Photo } from '@/types'

/** Pinned first, then by date in the direction the hosts chose. */
function orderPhotos(photos: Omit<Photo, 'url'>[], direction: GalleryDirection) {
  const sign = direction === 'newest' ? -1 : 1
  return [...photos].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
    return sign * a.created_at.localeCompare(b.created_at)
  })
}

export async function fetchPublishedPhotos(direction: GalleryDirection = 'newest'): Promise<Photo[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .eq('is_published', true)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: direction === 'oldest' })
    if (error) throw error
    return data.map(withPublicUrl)
  }

  const photos = readDemo<Omit<Photo, 'url'>[]>(DEMO_KEY, [])
  return orderPhotos(photos.filter((p) => p.is_published), direction).map(withPublicUrl)
}
```

In `uploadPhoto`, add `source: 'admin', guest_name: null, is_pinned: false,` to both the Supabase `insert({...})` object and the demo `photos.unshift({...})` object (next to `sort_order: 0`).

Append to the end of the file:

```ts
export async function setPhotoPinned(id: string, pinned: boolean): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('photos').update({ is_pinned: pinned }).eq('id', id)
    if (error) throw error
    return
  }
  const photos = readDemo<Omit<Photo, 'url'>[]>(DEMO_KEY, [])
  writeDemo(DEMO_KEY, photos.map((p) => (p.id === id ? { ...p, is_pinned: pinned } : p)))
}

export async function updatePhotoText(
  id: string,
  text: { caption: string | null; guest_name: string | null },
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('photos').update(text).eq('id', id)
    if (error) throw error
    return
  }
  const photos = readDemo<Omit<Photo, 'url'>[]>(DEMO_KEY, [])
  writeDemo(DEMO_KEY, photos.map((p) => (p.id === id ? { ...p, ...text } : p)))
}

/**
 * Removes every guest photo and its file. This is what makes testing before
 * the party clean: switch on, shoot, look, delete all, switch off.
 */
export async function deleteAllGuestPhotos(): Promise<number> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('photos')
      .select('id, storage_path')
      .eq('source', 'guest')
    if (error) throw error
    if (data.length === 0) return 0
    const { error: dbError } = await supabase.from('photos').delete().eq('source', 'guest')
    if (dbError) throw dbError
    // Files second: a row without a file is invisible; a file without a row
    // is an orphan nobody can see either, so this order loses nothing if the
    // second call fails.
    await supabase.storage.from(BUCKET).remove(data.map((p) => p.storage_path))
    return data.length
  }
  const photos = readDemo<Omit<Photo, 'url'>[]>(DEMO_KEY, [])
  const kept = photos.filter((p) => p.source !== 'guest')
  writeDemo(DEMO_KEY, kept)
  return photos.length - kept.length
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: no output, exit 0. (`GalleryTab.tsx` still compiles: it only reads fields that still exist.)

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/api/photos.ts src/lib/api/guestCameraSettings.ts
git commit -m "Photo type, pinned-first ordering, and guest-camera helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Server text sanitiser

**Files:**
- Create: `api/_lib/text.ts`
- Test: `api/_lib/text.test.ts`

**Interfaces:**
- Produces: `sanitizeText(input: unknown, max: number): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// api/_lib/text.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeText } from './text.ts'

test('trims, collapses whitespace, strips control characters', () => {
  assert.equal(sanitizeText('  Say  hi the\twind \n', 120), 'Say hi the wind')
})

test('truncates to max', () => {
  assert.equal(sanitizeText('abcdefghij', 4), 'abcd')
})

test('empty, whitespace-only and non-strings become null', () => {
  assert.equal(sanitizeText('', 120), null)
  assert.equal(sanitizeText('   ', 120), null)
  assert.equal(sanitizeText(undefined, 120), null)
  assert.equal(sanitizeText(42, 120), null)
  assert.equal(sanitizeText({ x: 1 }, 120), null)
})

test('keeps Danish letters and emoji', () => {
  assert.equal(sanitizeText('Skål for Victor 🎉', 120), 'Skål for Victor 🎉')
})

test('strips real control characters, not just whitespace ones', () => {
  assert.equal(sanitizeText('A\u0000B\u001bC\u007fD', 120), 'ABCD')
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test api/_lib/text.test.ts`
Expected: fails with `Cannot find module './text.ts'`.

- [ ] **Step 3: Implement**

```ts
// api/_lib/text.ts
/**
 * One sanitiser for every free-text field a guest can write. Control
 * characters are stripped so a name cannot smuggle terminal escapes onto the
 * wall; whitespace is collapsed so "A   B" and
 * "A B" read the same; the result is capped and empty becomes null so the
 * database stores "nothing" as NULL rather than "".
 */
export function sanitizeText(input: unknown, max: number): string | null {
  if (typeof input !== 'string') return null
  const cleaned = input
    // 0x09-0x0D (tab, LF, VT, FF, CR) are deliberately NOT in this class: they
    // are whitespace, and the next step collapses them to a single space. The
    // first version stripped them here and 'the<TAB>wind' became 'thewind'.
    .replace(/[\u0000-\u0008\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
  return cleaned.length > 0 ? cleaned : null
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --disable-warning=ExperimentalWarning --test api/_lib/text.test.ts`
Expected: `ℹ pass 5`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/text.ts api/_lib/text.test.ts
git commit -m "Add the shared guest-text sanitiser

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Raw body reader and uploader hash

**Files:**
- Create: `api/_lib/upload.ts`
- Test: `api/_lib/upload.test.ts`

**Interfaces:**
- Produces:
  - `readRawBody(req, maxBytes: number): Promise<Buffer>` — throws `BodyTooLarge` when over the cap
  - `class BodyTooLarge extends Error`
  - `clientIp(req): string`
  - `uploaderHash(ip: string, secret: string): string` — 32 hex chars

- [ ] **Step 1: Write the failing test**

```ts
// api/_lib/upload.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { BodyTooLarge, clientIp, readRawBody, uploaderHash } from './upload.ts'

const stream = (chunks: string[]) => Readable.from(chunks.map((c) => Buffer.from(c)))

test('reads a streamed body (local dev plugin)', async () => {
  const body = await readRawBody(stream(['ab', 'cd']) as never, 100)
  assert.equal(body.toString(), 'abcd')
})

test('uses a pre-parsed Buffer body (Vercel)', async () => {
  const req = { body: Buffer.from('xyz') }
  const body = await readRawBody(req as never, 100)
  assert.equal(body.toString(), 'xyz')
})

test('rejects a streamed body over the cap without reading it all', async () => {
  // A generator that would run forever, counting how many chunks were pulled.
  // The cap is crossed on the second chunk; a reader that drains the stream
  // and checks afterwards would never return. The count is 2 because
  // Readable.from reads exactly one chunk ahead (highWaterMark 1 for
  // iterables), so it measures the stream's readahead, not the reader's
  // consumption; the hang of a draining reader is the real proof.
  let pulled = 0
  async function* endless() {
    for (;;) {
      yield Buffer.from('a'.repeat(60))
      pulled++
    }
  }
  await assert.rejects(readRawBody(Readable.from(endless()) as never, 100), BodyTooLarge)
  assert.equal(pulled, 2)
})

test('rejects a pre-parsed body over the cap', async () => {
  await assert.rejects(readRawBody({ body: Buffer.alloc(101) } as never, 100), BodyTooLarge)
})

test('client ip is the first x-forwarded-for entry, else the socket', () => {
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }, socket: {} } as never), '1.2.3.4')
  assert.equal(clientIp({ headers: {}, socket: { remoteAddress: '::1' } } as never), '::1')
})

test('uploader hash is stable, secret-dependent, 32 hex chars', () => {
  const a = uploaderHash('1.2.3.4', 'secret')
  assert.match(a, /^[0-9a-f]{32}$/)
  assert.equal(a, uploaderHash('1.2.3.4', 'secret'))
  assert.notEqual(a, uploaderHash('1.2.3.4', 'other'))
  assert.notEqual(a, uploaderHash('1.2.3.5', 'secret'))
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test api/_lib/upload.test.ts`
Expected: fails with `Cannot find module './upload.ts'`.

- [ ] **Step 3: Implement**

```ts
// api/_lib/upload.ts
import { createHmac } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

export class BodyTooLarge extends Error {
  constructor() {
    super('body too large')
    this.name = 'BodyTooLarge'
  }
}

/**
 * The request body as bytes, from either runtime.
 *
 * Vercel's Node runtime reads the body before the handler runs and puts it on
 * req.body — a Buffer for binary content types. The local Vite plugin hands
 * the handler a raw Node request whose body is still a stream. Reading either
 * here keeps the route identical in both places, which is the same reason
 * readJsonBody in http.ts exists.
 *
 * A streamed body is abandoned the moment it passes the cap rather than read
 * to the end and then rejected: a 4 MB cap is only a cap if the function stops
 * at 4 MB.
 */
export async function readRawBody(
  req: IncomingMessage & { body?: unknown },
  maxBytes: number,
): Promise<Buffer> {
  if (req.body !== undefined) {
    const buf = Buffer.isBuffer(req.body)
      ? req.body
      : typeof req.body === 'string'
        ? Buffer.from(req.body)
        : Buffer.from(JSON.stringify(req.body))
    if (buf.length > maxBytes) throw new BodyTooLarge()
    return buf
  }
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const b = chunk as Buffer
    total += b.length
    if (total > maxBytes) throw new BodyTooLarge()
    chunks.push(b)
  }
  return Buffer.concat(chunks)
}

/** Vercel puts the real client first in x-forwarded-for. */
export function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for']
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim()
  return first || req.socket?.remoteAddress || 'unknown'
}

/**
 * The per-phone key for the rate limit. HMAC rather than a plain hash so the
 * value cannot be reversed by hashing candidate IPs; the secret is the service
 * key, which is already a server secret, so no new configuration is needed.
 * 32 hex characters is plenty of distinctness for a party.
 */
export function uploaderHash(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(ip).digest('hex').slice(0, 32)
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --disable-warning=ExperimentalWarning --test api/_lib/upload.test.ts`
Expected: `ℹ pass 6`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/upload.ts api/_lib/upload.test.ts
git commit -m "Add raw-body reader and uploader hash for the guest upload route

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The upload route, with its API suite

**Files:**
- Create: `api/photos/guest.ts`
- Create: `.superpowers/sdd/2026-09-03-minigolf/verify_guest_camera.mjs` (gitignored; suite A now, suites B–D appended in later tasks)

**Interfaces:**
- Consumes: `sanitizeText` (Task 3), `readRawBody`/`BodyTooLarge`/`clientIp`/`uploaderHash` (Task 4), `sendJson`/`readJsonBody` (existing), `getSupabaseAdmin` (existing)
- Produces:
  - `POST /api/photos/guest` — body: raw image bytes; headers `Content-Type`, `X-Image-Width`, `X-Image-Height` → `201 { ok:true, id }`
  - `PATCH /api/photos/guest` — JSON `{ id, caption?, guest_name? }` → `200 { ok:true }`
  - Errors: `403` off, `429` rate, `415` type, `413` size, `400` headers/body, `404` unknown id, `405` method (Danish), `500` generic — and any uncaught throw inside either body also yields the `500` JSON shape

- [ ] **Step 1: Write the route**

```ts
// api/photos/guest.ts
import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readJsonBody, sendJson } from '../_lib/http.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'
import { sanitizeText } from '../_lib/text.js'
import { BodyTooLarge, clientIp, readRawBody, uploaderHash } from '../_lib/upload.js'

/**
 * The guest camera's only write path.
 *
 * Guests never get a key with write access: the anon key can read published
 * photos and two public settings, and that is all. Everything a phone sends
 * comes through here with the service key, which is why the switch, the size
 * cap, the type check and the rate limit live in this file and nowhere else.
 * Hiding the button on /kamera when the camera is off is a courtesy; this
 * route refusing is the rule.
 */

const BUCKET = 'gallery'
const MAX_BYTES = 4 * 1024 * 1024
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp'])
const CAPTION_MAX = 120
const NAME_MAX = 30
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 10 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Req = IncomingMessage & { body?: unknown }

export default async function handler(req: Req, res: ServerResponse): Promise<void> {
  // One catch for both methods, so the JSON error contract holds even for the
  // failures the bodies do not anticipate — a malformed PATCH body throwing
  // inside JSON.parse, a missing env var throwing inside getSupabaseAdmin.
  // Without it, Vercel answers those with its own plain 500, not
  // { ok: false, error }. `await` matters: a returned promise would escape.
  try {
    if (req.method === 'POST') return await upload(req, res)
    if (req.method === 'PATCH') return await caption(req, res)
    sendJson(res, 405, { ok: false, error: 'Metoden er ikke tilladt.' })
  } catch (e) {
    console.error('[photos/guest] unhandled:', e)
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Noget gik galt. Prøv igen om lidt.' })
  }
}

async function cameraEnabled(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<boolean> {
  // Read fresh on every call. The UI reads this too, but the UI is not the
  // enforcement — a request made with the button hidden must still be refused.
  const { data } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'guest_camera')
    .maybeSingle()
  return (data?.value as { enabled?: boolean } | null)?.enabled === true
}

async function upload(req: Req, res: ServerResponse): Promise<void> {
  const supabase = getSupabaseAdmin()

  if (!(await cameraEnabled(supabase))) {
    sendJson(res, 403, { ok: false, error: 'Kameraet er slukket.' })
    return
  }

  const hash = uploaderHash(clientIp(req), process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count, error: countError } = await supabase
    .from('photos')
    .select('id', { count: 'exact', head: true })
    .eq('uploader_hash', hash)
    .gt('created_at', since)
  if (countError) {
    sendJson(res, 500, { ok: false, error: 'Noget gik galt. Prøv igen om lidt.' })
    return
  }
  if ((count ?? 0) >= RATE_LIMIT) {
    sendJson(res, 429, { ok: false, error: 'Du har taget rigtig mange billeder. Vent lidt, og prøv igen.' })
    return
  }

  const contentType = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  if (!ACCEPTED.has(contentType)) {
    sendJson(res, 415, { ok: false, error: 'Det skal være et billede (JPEG, PNG eller WebP).' })
    return
  }

  const width = Number(req.headers['x-image-width'])
  const height = Number(req.headers['x-image-height'])
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    sendJson(res, 400, { ok: false, error: 'Billedets størrelse mangler.' })
    return
  }

  let bytes: Buffer
  try {
    bytes = await readRawBody(req, MAX_BYTES)
  } catch (e) {
    if (e instanceof BodyTooLarge) {
      sendJson(res, 413, { ok: false, error: 'Billedet er for stort. Prøv igen.' })
      return
    }
    throw e
  }
  if (bytes.length === 0) {
    sendJson(res, 400, { ok: false, error: 'Der kom ikke noget billede med.' })
    return
  }

  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'
  const path = `guest/${randomUUID()}.${ext}`
  const { error: storageError } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    cacheControl: '31536000',
    upsert: false,
  })
  if (storageError) {
    console.error('[photos/guest] storage upload failed:', storageError)
    sendJson(res, 500, { ok: false, error: 'Billedet kunne ikke gemmes. Prøv igen.' })
    return
  }

  const { data, error } = await supabase
    .from('photos')
    .insert({
      storage_path: path,
      caption: null,
      guest_name: null,
      is_published: true,
      is_pinned: false,
      source: 'guest',
      width,
      height,
      sort_order: 0,
      uploader_hash: hash,
    })
    .select('id')
    .single()
  if (error || !data) {
    console.error('[photos/guest] insert failed:', error)
    // Do not leave an orphan file behind a failed row.
    await supabase.storage.from(BUCKET).remove([path])
    sendJson(res, 500, { ok: false, error: 'Billedet kunne ikke gemmes. Prøv igen.' })
    return
  }

  sendJson(res, 201, { ok: true, id: data.id })
}

async function caption(req: Req, res: ServerResponse): Promise<void> {
  const body = await readJsonBody<{ id?: unknown; caption?: unknown; guest_name?: unknown }>(req)
  const id = typeof body.id === 'string' && UUID.test(body.id) ? body.id : null
  if (!id) {
    sendJson(res, 400, { ok: false, error: 'Billedet blev ikke fundet.' })
    return
  }

  const supabase = getSupabaseAdmin()
  // The id is the capability: it is a UUID this route issued to the phone that
  // took the photo, nobody else has it, and it cannot be enumerated. Only
  // guest rows, and only the two text fields — never published/pinned/delete.
  const { data, error } = await supabase
    .from('photos')
    .update({
      caption: sanitizeText(body.caption, CAPTION_MAX),
      guest_name: sanitizeText(body.guest_name, NAME_MAX),
    })
    .eq('id', id)
    .eq('source', 'guest')
    .select('id')
  if (error) {
    console.error('[photos/guest] caption update failed:', error)
    sendJson(res, 500, { ok: false, error: 'Teksten kunne ikke gemmes. Prøv igen.' })
    return
  }
  if (!data || data.length === 0) {
    sendJson(res, 404, { ok: false, error: 'Billedet blev ikke fundet.' })
    return
  }
  sendJson(res, 200, { ok: true })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 3: Write the API suite (suite A of the harness)**

Create `.superpowers/sdd/2026-09-03-minigolf/verify_guest_camera.mjs`. The top is shared by every later suite in this file.

```js
/**
 * Guest camera verification, against the real dev server and the real
 * Supabase project. Suite A hits the API directly; B–D drive the browser.
 *
 *   node verify_guest_camera.mjs http://localhost:5173 ./cam-out [A|B|C|D|all]
 *
 * Every row it creates is a guest row created after START and is removed at
 * the end, files included. It flips the camera switch and restores it.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const [, , BASE = 'http://localhost:5173', OUT = './cam-out', ONLY = 'all'] = process.argv
mkdirSync(OUT, { recursive: true })
const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const SB = env.VITE_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }
const START = new Date().toISOString()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const checks = []
const ok = (name, pass, detail = '') => {
  checks.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}
const run = (suite) => ONLY === 'all' || ONLY === suite

// --- settings, through the service key ------------------------------------
async function setSwitch(enabled) {
  await fetch(`${SB}/rest/v1/site_settings?key=eq.guest_camera`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ value: { enabled } }),
  })
}
async function setOrder(direction) {
  await fetch(`${SB}/rest/v1/site_settings?key=eq.gallery_order`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ value: { direction } }),
  })
}
const originalSwitch = await fetch(`${SB}/rest/v1/site_settings?key=eq.guest_camera&select=value`, { headers: H })
  .then((r) => r.json()).then((rows) => rows[0]?.value?.enabled === true)

// --- a real, tiny JPEG (1x1, 631 bytes) so uploads are cheap -----------------
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpgA//Z',
  'base64',
)
const upload = (opts = {}) => fetch(`${BASE}/api/photos/guest`, {
  method: 'POST',
  headers: { 'content-type': opts.type ?? 'image/jpeg', 'x-image-width': String(opts.w ?? 1), 'x-image-height': String(opts.h ?? 1), ...(opts.headers ?? {}) },
  body: opts.body ?? JPEG,
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
const patch = (body) => fetch(`${BASE}/api/photos/guest`, {
  method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
const guestRows = () => fetch(
  `${SB}/rest/v1/photos?select=id,storage_path,caption,guest_name,source,is_published,is_pinned,width,height,uploader_hash&source=eq.guest&created_at=gt.${START}&order=created_at`,
  { headers: H }).then((r) => r.json())

// ===========================================================================
// A. the route
// ===========================================================================
if (run('A')) {
  console.log('\n== A. /api/photos/guest ==')
  await setSwitch(false)
  const off = await upload()
  ok('A1 switch off -> 403 with the Danish sentence', off.status === 403 && off.body.error === 'Kameraet er slukket.', JSON.stringify(off.body))

  await setSwitch(true)
  const bad = await upload({ type: 'text/plain', body: Buffer.from('hello') })
  ok('A2 wrong content type -> 415', bad.status === 415, `${bad.status} ${bad.body.error}`)
  const big = await upload({ body: Buffer.alloc(4 * 1024 * 1024 + 1) })
  ok('A3 over 4 MB -> 413', big.status === 413, `${big.status} ${big.body.error}`)
  const noDims = await upload({ headers: { 'x-image-width': 'nope' } })
  ok('A4 bad dimension header -> 400', noDims.status === 400, `${noDims.status}`)

  const good = await upload({ w: 1200, h: 900 })
  ok('A5 good upload -> 201 with an id', good.status === 201 && /^[0-9a-f-]{36}$/.test(good.body.id ?? ''), JSON.stringify(good.body))
  let rows = await guestRows()
  const row = rows.find((r) => r.id === good.body.id)
  ok('A6 the row is a published, unpinned guest photo with the phone\'s dimensions',
    !!row && row.source === 'guest' && row.is_published === true && row.is_pinned === false && row.width === 1200 && row.height === 900 && row.caption === null,
    row ? row.storage_path : 'no row')
  ok('A7 the file lives under guest/ in the bucket', !!row && /^guest\/[0-9a-f-]{36}\.jpg$/.test(row.storage_path), row?.storage_path)
  ok('A8 uploader_hash is set and is 32 hex chars, never the IP', !!row && /^[0-9a-f]{32}$/.test(row.uploader_hash ?? ''), row?.uploader_hash)
  const fileOk = await fetch(`${SB}/storage/v1/object/public/gallery/${row.storage_path}`).then((r) => r.status)
  ok('A9 the file is publicly readable at its URL', fileOk === 200, `HTTP ${fileOk}`)

  const c1 = await patch({ id: good.body.id, caption: '  Say   hi the wind ', guest_name: 'Sofie' })
  rows = await guestRows()
  const after = rows.find((r) => r.id === good.body.id)
  ok('A10 PATCH saves a sanitised caption and name', c1.status === 200 && after?.caption === 'Say hi the wind' && after?.guest_name === 'Sofie', `${after?.caption} / ${after?.guest_name}`)
  const c2 = await patch({ id: good.body.id, caption: 'x'.repeat(200), guest_name: 'y'.repeat(50) })
  const capped = (await guestRows()).find((r) => r.id === good.body.id)
  ok('A11 PATCH caps caption at 120 and name at 30', c2.status === 200 && capped?.caption?.length === 120 && capped?.guest_name?.length === 30, `${capped?.caption?.length} / ${capped?.guest_name?.length}`)
  const c3 = await patch({ id: good.body.id, caption: '', guest_name: '   ' })
  const cleared = (await guestRows()).find((r) => r.id === good.body.id)
  ok('A12 empty text clears to null', c3.status === 200 && cleared?.caption === null && cleared?.guest_name === null)
  const unknown = await patch({ id: '00000000-0000-4000-8000-000000000000', caption: 'x' })
  ok('A13 PATCH with an unknown id -> 404', unknown.status === 404)
  const junk = await patch({ id: 'not-a-uuid', caption: 'x' })
  ok('A14 PATCH with a malformed id -> 400', junk.status === 400)
  const sneaky = await patch({ id: good.body.id, caption: 'ok', is_published: false, is_pinned: true })
  const still = (await guestRows()).find((r) => r.id === good.body.id)
  ok('A15 PATCH cannot change published or pinned', sneaky.status === 200 && still?.is_published === true && still?.is_pinned === false)

  // Rate limit: 19 more good uploads reach 20 in the window; the 21st is refused.
  let last = null
  for (let i = 0; i < 19; i++) last = await upload()
  ok('A16 the 20th upload in the window is still accepted', last?.status === 201, `${last?.status}`)
  const over = await upload()
  ok('A17 the 21st upload within 10 minutes -> 429', over.status === 429, `${over.status} ${over.body.error}`)

  await setSwitch(false)
  const offAgain = await upload()
  ok('A18 switching off refuses immediately, no cache', offAgain.status === 403)
}
```

Then, at the very end of the file (after all suites), the cleanup that every later task keeps last:

```js
// ===========================================================================
// cleanup — rows and files created after START, switch restored
// ===========================================================================
console.log('\n== cleanup ==')
const leftovers = await guestRows()
if (leftovers.length) {
  await fetch(`${SB}/storage/v1/object/gallery`, {
    method: 'DELETE', headers: H, body: JSON.stringify({ prefixes: leftovers.map((r) => r.storage_path) }),
  })
  await fetch(`${SB}/rest/v1/photos?source=eq.guest&created_at=gt.${START}`, { method: 'DELETE', headers: H })
}
const remaining = await guestRows()
ok('Z1 every test row is removed', remaining.length === 0, `${leftovers.length} deleted`)
const gone = leftovers.length
  ? await fetch(`${SB}/storage/v1/object/public/gallery/${leftovers[0].storage_path}`).then((r) => r.status)
  : 404
ok('Z2 test files are removed from storage', gone === 400 || gone === 404, `HTTP ${gone}`)
await setSwitch(originalSwitch)
ok('Z3 the camera switch is back to what it was', true, originalSwitch ? 'on' : 'off')

const failed = checks.filter((c) => !c.pass)
console.log(`\n${checks.length - failed.length}/${checks.length} passed`)
writeFileSync(join(OUT, 'guest-camera-report.json'), JSON.stringify({ checks }, null, 1))
process.exit(failed.length ? 1 : 0)
```

- [ ] **Step 4: Run suite A**

Run (dev server must be up on 5173 and the migration applied):
```bash
node .superpowers/sdd/2026-09-03-minigolf/verify_guest_camera.mjs http://localhost:5173 .superpowers/sdd/2026-09-03-minigolf/cam-out A
```
Expected: `21/21 passed` (A1–A18 plus Z1–Z3). If A17 fails with 201, the count query is not seeing the rows: check the `uploader_hash` index exists and that `created_at` is being compared as ISO.

- [ ] **Step 5: Commit**

```bash
git add api/photos/guest.ts
git commit -m "Add POST/PATCH /api/photos/guest: the guest camera's only write path

Switch enforced server-side, 4 MB cap, type check, per-IP rate limit through
a hashed column, caption/name via PATCH keyed on the issued UUID.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(The harness is gitignored; nothing to add for it.)

---

### Task 6: On-phone resize and the client calls

**Files:**
- Create: `src/lib/imageFit.ts` (pure, no imports — testable with `node --test`)
- Test: `src/lib/imageFit.test.ts`
- Create: `src/lib/guestCamera.ts` (browser: canvas + fetch)

**Interfaces:**
- Produces:
  - `fitWithin(width: number, height: number, maxSide: number): { width: number; height: number }`
  - `resizeForUpload(file: File): Promise<{ blob: Blob; width: number; height: number }>`
  - `uploadGuestPhoto(photo: { blob: Blob; width: number; height: number }): Promise<string>` (resolves to the id; rejects with `Error(message)` carrying the server's Danish sentence)
  - `saveGuestCaption(id: string, caption: string, guestName: string): Promise<void>`
  - `class GuestCameraOff extends Error` (thrown by `uploadGuestPhoto` on 403)

- [ ] **Step 1: Write the failing test for the pure part**

```ts
// src/lib/imageFit.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitWithin } from './imageFit.ts'

test('a landscape photo is scaled so the long side is the max', () => {
  assert.deepEqual(fitWithin(4000, 3000, 2000), { width: 2000, height: 1500 })
})

test('a portrait photo is scaled so the long side is the max', () => {
  assert.deepEqual(fitWithin(3000, 4000, 2000), { width: 1500, height: 2000 })
})

test('a photo already within the max is untouched', () => {
  assert.deepEqual(fitWithin(1200, 800, 2000), { width: 1200, height: 800 })
})

test('dimensions are whole pixels', () => {
  const r = fitWithin(4001, 3000, 2000)
  assert.equal(r.width, 2000)
  assert.equal(Number.isInteger(r.height), true)
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test src/lib/imageFit.test.ts`
Expected: `Cannot find module './imageFit.ts'`.

- [ ] **Step 3: Implement the pure part**

```ts
// src/lib/imageFit.ts
/**
 * Scales a size down so its longer side is at most `maxSide`, keeping the
 * aspect ratio. Never scales up. Pure, so it can be tested without a browser;
 * the canvas work that uses it is in guestCamera.ts.
 */
export function fitWithin(width: number, height: number, maxSide: number) {
  const longest = Math.max(width, height)
  if (longest <= maxSide) return { width, height }
  const scale = maxSide / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --disable-warning=ExperimentalWarning --test src/lib/imageFit.test.ts`
Expected: `ℹ pass 4`, `ℹ fail 0`.

- [ ] **Step 5: Write the browser side**

```ts
// src/lib/guestCamera.ts
import { fitWithin } from '@/lib/imageFit'

/** The spec's numbers. 2000 px keeps a phone photo well under the 4 MB cap. */
const MAX_SIDE = 2000
const JPEG_QUALITY = 0.85

export class GuestCameraOff extends Error {
  constructor() {
    super('Kameraet er slukket.')
    this.name = 'GuestCameraOff'
  }
}

/**
 * Shrinks the photo ON THE PHONE before it goes anywhere.
 *
 * A modern phone photo is 5–12 MB and Vercel's request-body limit is 4.5 MB,
 * so this is not an optimisation, it is what makes the upload possible at
 * all. Re-encoding through a canvas also drops every EXIF field, including
 * GPS, so a guest's location never leaves their phone.
 *
 * createImageBitmap with imageOrientation: 'from-image' applies the EXIF
 * rotation first, so portrait shots come out upright rather than sideways.
 */
export async function resizeForUpload(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Billedet kunne ikke læses. Prøv et andet.')
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_SIDE)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Kunne ikke behandle billedet.')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new Error('Kunne ikke behandle billedet.')
  return { blob, width, height }
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null
  return body?.error ?? fallback
}

/** Uploads the resized photo. Resolves to the photo's id for the caption step. */
export async function uploadGuestPhoto(photo: { blob: Blob; width: number; height: number }): Promise<string> {
  let response: Response
  try {
    response = await fetch('/api/photos/guest', {
      method: 'POST',
      headers: {
        'Content-Type': 'image/jpeg',
        'X-Image-Width': String(photo.width),
        'X-Image-Height': String(photo.height),
      },
      body: photo.blob,
    })
  } catch {
    throw new Error('Ingen forbindelse. Tjek netværket og prøv igen.')
  }
  if (response.status === 403) throw new GuestCameraOff()
  if (!response.ok) throw new Error(await errorMessage(response, 'Billedet kunne ikke sendes. Prøv igen.'))
  const body = (await response.json()) as { id: string }
  return body.id
}

export async function saveGuestCaption(id: string, caption: string, guestName: string): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/photos/guest', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, caption, guest_name: guestName }),
    })
  } catch {
    throw new Error('Ingen forbindelse. Tjek netværket og prøv igen.')
  }
  if (!response.ok) throw new Error(await errorMessage(response, 'Teksten kunne ikke gemmes. Prøv igen.'))
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/imageFit.ts src/lib/imageFit.test.ts src/lib/guestCamera.ts
git commit -m "Resize guest photos on the phone and call the upload route

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Polaroid tilt and the Polaroid component

**Files:**
- Create: `src/lib/polaroidTilt.ts` (pure)
- Test: `src/lib/polaroidTilt.test.ts`
- Create: `src/components/Polaroid.tsx`
- Modify: `index.html:23` (Google Fonts href) and `src/index.css` (the `@theme` block that defines `--font-display` at line 4)

**Interfaces:**
- Produces:
  - `tiltFor(id: string): { rotate: number; dx: number; dy: number }` — rotate in degrees within ±4, dx/dy in px within ±6, deterministic
  - `<Polaroid url caption guestName width height tilted? className? />`
  - Tailwind utility `font-hand` (Caveat)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/polaroidTilt.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tiltFor } from './polaroidTilt.ts'

test('the same id always gets the same tilt', () => {
  assert.deepEqual(tiltFor('e598352b-5b9d-4fbf-b316-cd792b1b8f7c'), tiltFor('e598352b-5b9d-4fbf-b316-cd792b1b8f7c'))
})

test('different ids get different tilts', () => {
  assert.notDeepEqual(tiltFor('a'), tiltFor('b'))
})

test('rotation is within ±4 degrees and offsets within ±6 px, for many ids', () => {
  for (let i = 0; i < 500; i++) {
    const t = tiltFor(`id-${i}`)
    assert.ok(Math.abs(t.rotate) <= 4, `rotate ${t.rotate}`)
    assert.ok(Math.abs(t.dx) <= 6, `dx ${t.dx}`)
    assert.ok(Math.abs(t.dy) <= 6, `dy ${t.dy}`)
  }
})

test('tilts actually use both signs', () => {
  const signs = new Set(Array.from({ length: 50 }, (_, i) => Math.sign(tiltFor(`id-${i}`).rotate)))
  assert.ok(signs.has(1) && signs.has(-1))
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test src/lib/polaroidTilt.test.ts`
Expected: `Cannot find module './polaroidTilt.ts'`.

- [ ] **Step 3: Implement**

```ts
// src/lib/polaroidTilt.ts
/**
 * A small, fixed tilt per photo, so the wall looks tossed on a table but never
 * moves: the wall re-fetches every 15 s while the camera is on, and a random
 * tilt would make every polaroid twitch on each refresh. Hashing the id makes
 * the tilt a property of the photo rather than of the render.
 */
function hash(s: string): number {
  // djb2, kept as an unsigned 32-bit integer.
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  // MurmurHash3 finaliser: spreads a one-character change across all 32
  // bits, so ids that differ by one character never share a tilt.
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  h ^= h >>> 16
  return h >>> 0
}

/** Maps a slice of the hash to [-limit, +limit], rounded to one decimal. */
function spread(h: number, shift: number, limit: number): number {
  const unit = ((h >>> shift) & 0xff) / 255 // 0..1
  return Math.round((unit * 2 - 1) * limit * 10) / 10
}

export function tiltFor(id: string) {
  const h = hash(id)
  return { rotate: spread(h, 0, 4), dx: spread(h, 8, 6), dy: spread(h, 16, 6) }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --disable-warning=ExperimentalWarning --test src/lib/polaroidTilt.test.ts`
Expected: `ℹ pass 4`, `ℹ fail 0`.

- [ ] **Step 5: Add the handwriting font**

In `index.html` line 23, replace the Google Fonts href with (Caveat added at the end):

```
href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&family=Caveat:wght@400;600&display=swap"
```

In `src/index.css`, directly after the line `--font-sans: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;` (line 5, inside the same `@theme` block as `--font-display`), add:

```css
  --font-hand: 'Caveat', 'Bradley Hand', 'Segoe Print', cursive;
```

Tailwind v4 turns that theme variable into the `font-hand` utility automatically.

- [ ] **Step 6: Write the component**

```tsx
// src/components/Polaroid.tsx
import { tiltFor } from '@/lib/polaroidTilt'
import { cn } from '@/lib/utils'

/**
 * One print: white frame, the photo, a deeper band at the bottom for the
 * handwriting. The tilt is a property of the photo (see polaroidTilt.ts) so
 * the wall never jitters. Uses the stored width/height for the image box so
 * the wall does not reflow as photos load.
 */
export function Polaroid({
  id,
  url,
  caption,
  guestName,
  width,
  height,
  tilted = true,
  className,
}: {
  id: string
  url: string
  caption: string | null
  guestName: string | null
  width: number | null
  height: number | null
  /** Off for the admin thumbnails, where straight rows are easier to scan. */
  tilted?: boolean
  className?: string
}) {
  const t = tilted ? tiltFor(id) : { rotate: 0, dx: 0, dy: 0 }
  const ratio = width && height ? `${width} / ${height}` : '1 / 1'
  return (
    <figure
      className={cn('bg-white p-3 pb-4 shadow-[0_6px_20px_rgba(20,20,20,0.18)]', className)}
      style={{ transform: `translate(${t.dx}px, ${t.dy}px) rotate(${t.rotate}deg)` }}
    >
      <div className="overflow-hidden bg-cream-100" style={{ aspectRatio: ratio }}>
        <img
          src={url}
          alt={caption ?? ''}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </div>
      <figcaption className="font-hand mt-3 min-h-7 truncate text-center text-xl leading-7 text-ink-900">
        {caption}
        {guestName && (
          <span className={cn('text-ink-500', caption && 'ml-2')}>
            {caption ? `— ${guestName}` : guestName}
          </span>
        )}
      </figcaption>
    </figure>
  )
}
```

(The em dash between caption and name is deliberate typography inside the polaroid, not prose copy — it mirrors a handwritten " — Sofie". It is the one allowed use.)

- [ ] **Step 7: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/lib/polaroidTilt.ts src/lib/polaroidTilt.test.ts src/components/Polaroid.tsx index.html src/index.css
git commit -m "Add the Polaroid component with a fixed per-photo tilt and the Caveat face

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: QR code

**Files:**
- Modify: `package.json` (via npm)
- Create: `src/components/QrCode.tsx`

**Interfaces:**
- Produces: `<QrCode value size? className? />` (renders an `<img>`), `downloadQrPng(value: string, filename: string): Promise<void>`

- [ ] **Step 1: Install**

```bash
npm install qrcode@1.5.4 && npm install -D @types/qrcode@1.5.6
```

- [ ] **Step 2: Write the component**

```tsx
// src/components/QrCode.tsx
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

/**
 * A QR code as a plain <img>. Rendered client-side by the `qrcode` package —
 * the one new dependency in the guest camera — as a data URL, so no request
 * leaves the page to draw it and nothing about it can be tracked.
 */
export function QrCode({ value, size = 192, className }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: '#1f1f1c', light: '#ffffff' } })
      .then((url) => { if (!cancelled) setSrc(url) })
    return () => { cancelled = true }
  }, [value, size])
  if (!src) return <div style={{ width: size, height: size }} className={className} aria-hidden />
  return <img src={src} width={size} height={size} alt={`QR-kode til ${value}`} className={className} />
}

/** A 1024 px PNG for printing, handed to the browser as a download. */
export async function downloadQrPng(value: string, filename: string): Promise<void> {
  const url = await QRCode.toDataURL(value, { width: 1024, margin: 2, color: { dark: '#1f1f1c', light: '#ffffff' } })
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/QrCode.tsx
git commit -m "Add the QR code component (qrcode, the feature's one new dependency)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: The `/kamera` page, with its browser suite

**Files:**
- Create: `src/pages/KameraPage.tsx`
- Modify: `src/App.tsx` (add the route)
- Modify: `.superpowers/sdd/2026-09-03-minigolf/verify_guest_camera.mjs` (append suite B before the cleanup block)

**Interfaces:**
- Consumes: `fetchGuestCameraEnabled` (Task 2), `resizeForUpload`/`uploadGuestPhoto`/`saveGuestCaption`/`GuestCameraOff` (Task 6), `Polaroid` (Task 7), `Button`, `Input`
- Produces: route `/kamera`

- [ ] **Step 1: Write the page**

```tsx
// src/pages/KameraPage.tsx
import { Camera } from 'lucide-react'
import type { ChangeEvent, FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { Input } from '@/components/FormControls'
import { Polaroid } from '@/components/Polaroid'
import { fetchGuestCameraEnabled } from '@/lib/api/guestCameraSettings'
import { GuestCameraOff, resizeForUpload, saveGuestCaption, uploadGuestPhoto } from '@/lib/guestCamera'

/**
 * The disposable camera. One screen, held in one hand.
 *
 * The camera itself is the phone's: a file input with capture="environment"
 * opens the rear camera directly on iOS Safari and Android Chrome, with no
 * in-page viewfinder to build or maintain. When the OS hands the image back
 * it is shrunk on the phone (guestCamera.ts), sent, and shown as a polaroid
 * with two optional lines under it.
 */
type State =
  | { kind: 'loading' }
  | { kind: 'off' }
  | { kind: 'ready'; error: string | null }
  | { kind: 'uploading'; preview: string; width: number; height: number }
  | { kind: 'caption'; id: string; preview: string; width: number; height: number; saved: boolean; error: string | null }

export function KameraPage() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [caption, setCaption] = useState('')
  const [name, setName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchGuestCameraEnabled()
      .then((enabled) => setState(enabled ? { kind: 'ready', error: null } : { kind: 'off' }))
      .catch(() => setState({ kind: 'off' }))
  }, [])

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setState({ kind: 'ready', error: 'Det skal være et billede.' })
      return
    }
    let preview = ''
    try {
      const resized = await resizeForUpload(file)
      preview = URL.createObjectURL(resized.blob)
      setState({ kind: 'uploading', preview, width: resized.width, height: resized.height })
      const id = await uploadGuestPhoto(resized)
      setCaption('')
      setName('')
      setState({ kind: 'caption', id, preview, width: resized.width, height: resized.height, saved: false, error: null })
    } catch (e) {
      if (preview) URL.revokeObjectURL(preview)
      if (e instanceof GuestCameraOff) setState({ kind: 'off' })
      else setState({ kind: 'ready', error: e instanceof Error ? e.message : 'Noget gik galt. Prøv igen.' })
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (state.kind !== 'caption') return
    setIsSaving(true)
    try {
      await saveGuestCaption(state.id, caption, name)
      setState({ ...state, saved: true, error: null })
    } catch (e) {
      setState({ ...state, error: e instanceof Error ? e.message : 'Teksten kunne ikke gemmes. Prøv igen.' })
    } finally {
      setIsSaving(false)
    }
  }

  function reset() {
    if (state.kind === 'caption' || state.kind === 'uploading') URL.revokeObjectURL(state.preview)
    setState({ kind: 'ready', error: null })
  }

  const shutter = (
    <label className="flex cursor-pointer flex-col items-center gap-4">
      <span className="flex h-28 w-28 items-center justify-center rounded-full bg-ink-900 text-cream-50 shadow-card active:scale-95">
        <Camera size={44} aria-hidden />
      </span>
      <span className="text-lg font-medium text-ink-900">Tag et billede</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="sr-only"
        aria-label="Tag et billede"
      />
    </label>
  )

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-6 py-10 text-center">
      <p className="text-xs tracking-[0.2em] text-green-700 uppercase">Victors konfirmation</p>

      {state.kind === 'loading' && <p className="text-ink-600">Et øjeblik...</p>}

      {state.kind === 'off' && (
        <>
          <h1 className="font-display text-3xl text-ink-900">Kameraet åbner til festen</h1>
          <p className="text-ink-600">Kom tilbage den 1. maj, så kan du tage billeder her.</p>
        </>
      )}

      {state.kind === 'ready' && (
        <>
          <h1 className="font-display text-3xl text-ink-900">Tag et billede til væggen</h1>
          <p className="text-ink-600">Det dukker op på hjemmesiden med det samme.</p>
          {shutter}
          {state.error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>}
        </>
      )}

      {(state.kind === 'uploading' || state.kind === 'caption') && (
        <div className="w-full max-w-xs">
          <Polaroid
            id={state.kind === 'caption' ? state.id : 'uploading'}
            url={state.preview}
            caption={state.kind === 'caption' && state.saved ? caption || null : null}
            guestName={state.kind === 'caption' && state.saved ? name || null : null}
            width={state.width}
            height={state.height}
            tilted={false}
          />
        </div>
      )}

      {state.kind === 'uploading' && <p className="text-ink-600">Sender billedet...</p>}

      {state.kind === 'caption' && !state.saved && (
        <form onSubmit={handleSave} className="flex w-full max-w-xs flex-col gap-3">
          <p className="text-ink-600">Det er på væggen. Vil du skrive noget under det?</p>
          <Input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={120} placeholder="Skriv noget under billedet" aria-label="Tekst under billedet" />
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="Dit fornavn (valgfrit)" aria-label="Dit fornavn" />
          {state.error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>}
          <div className="flex gap-3">
            <Button type="submit" disabled={isSaving} className="flex-1">{isSaving ? 'Gemmer...' : 'Gem'}</Button>
            <Button type="button" variant="outline" onClick={reset}>Tag et til</Button>
          </div>
        </form>
      )}

      {state.kind === 'caption' && state.saved && (
        <>
          <p className="text-ink-600">Tak! Det hænger på væggen nu.</p>
          <Button onClick={reset}>Tag et til</Button>
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Add the route**

In `src/App.tsx`, add the import and the route:

```tsx
import { KameraPage } from '@/pages/KameraPage'
// ...inside <Routes>, after the /minigolf route:
        <Route path="/kamera" element={<KameraPage />} />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 4: Append suite B to the harness** (before the `// cleanup` block)

Suite B needs a browser. Add the CDP boilerplate once, as functions used by B, C and D — copy this block right after suite A's closing `}`:

```js
// ===========================================================================
// browser helpers (B, C, D)
// ===========================================================================
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

async function browser(url, { width = 1440, height = 900, mobile = false } = {}) {
  const port = 9500 + Math.floor(Math.random() * 400)
  const profile = mkdtempSync(join(tmpdir(), 'cam-'))
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, '--enable-unsafe-swiftshader', '--no-first-run', url], { stdio: 'ignore' })
  let tab
  for (let i = 0; i < 60 && !tab; i++) {
    await sleep(500)
    try { tab = (await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())).find((x) => x.type === 'page' && x.webSocketDebuggerUrl) } catch { /* not up */ }
  }
  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pend = new Map()
  const errs = []
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errs.push(m.params.entry.text)
    if (m.method === 'Runtime.exceptionThrown') errs.push('EXC ' + m.params.exceptionDetails.text)
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id) }
  }
  const send = (k, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: k, params: p })) })
  const ev = async (x) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })
    if (exceptionDetails) throw new Error(exceptionDetails.text)
    return result.value
  }
  await send('Log.enable'); await send('Runtime.enable'); await send('DOM.enable')
  if (mobile) await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true })
  const shot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(OUT, name), Buffer.from(data, 'base64'))
  }
  /** Puts a real file into a file input, the way the OS camera would. */
  const setFile = async (selector, path) => {
    const { root } = await send('DOM.getDocument')
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector })
    await send('DOM.setFileInputFiles', { nodeId, files: [path] })
  }
  const close = () => { ws.close(); chrome.kill() }
  return { ev, send, shot, setFile, errs, close }
}

// A 640x480 JPEG on disk for the file input. Written once from the tiny JPEG,
// scaled up by the page's own resize step, so it exercises the real path.
const TEST_JPEG = join(OUT, 'test-shot.jpg')
writeFileSync(TEST_JPEG, JPEG)
```

Then suite B:

```js
// ===========================================================================
// B. /kamera on a phone
// ===========================================================================
if (run('B')) {
  console.log('\n== B. /kamera ==')
  await setSwitch(false)
  let b = await browser(`${BASE}/kamera`, { width: 390, height: 844, mobile: true })
  await sleep(4000)
  const offText = await b.ev(`document.body.innerText`)
  ok('B1 with the camera off the page says so and shows no button',
    /Kameraet åbner til festen/.test(offText) && !/Tag et billede/.test(offText))
  ok('B2 no horizontal overflow at 390 px', await b.ev(`document.documentElement.scrollWidth <= innerWidth`))
  await b.shot('kamera-off-390.png')
  b.close()

  await setSwitch(true)
  b = await browser(`${BASE}/kamera`, { width: 390, height: 844, mobile: true })
  await sleep(4000)
  ok('B3 with the camera on the shutter is there', await b.ev(`!!document.querySelector('input[type=file][capture]')`))
  ok('B4 the input opens the rear camera directly',
    (await b.ev(`document.querySelector('input[type=file]').getAttribute('capture')`)) === 'environment' &&
    (await b.ev(`document.querySelector('input[type=file]').getAttribute('accept')`)) === 'image/*')
  await b.shot('kamera-ready-390.png')

  await b.setFile('input[type=file]', TEST_JPEG)
  let reached = false
  for (let i = 0; i < 40 && !reached; i++) { await sleep(250); reached = await b.ev(`/Vil du skrive noget under det/.test(document.body.innerText)`) }
  ok('B5 choosing a photo uploads it and shows the caption step', reached)
  const rowsB = await guestRows()
  ok('B6 the row exists with the resized dimensions', rowsB.length >= 1 && rowsB[rowsB.length - 1].width > 0, rowsB.length ? `${rowsB[rowsB.length - 1].width}x${rowsB[rowsB.length - 1].height}` : 'no row')
  ok('B7 the preview is shown as a polaroid', await b.ev(`!!document.querySelector('figure img')`))
  await b.shot('kamera-caption-390.png')

  await b.ev(`(() => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    const [cap, nm] = document.querySelectorAll('form input')
    set.call(cap, 'Say hi the wind'); cap.dispatchEvent(new Event('input', { bubbles: true }))
    set.call(nm, 'Sofie'); nm.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('form').requestSubmit()
  })()`)
  let thanked = false
  for (let i = 0; i < 20 && !thanked; i++) { await sleep(250); thanked = await b.ev(`/Tak! Det hænger på væggen nu/.test(document.body.innerText)`) }
  ok('B8 saving the caption confirms', thanked)
  const saved = (await guestRows()).find((r) => r.id === rowsB[rowsB.length - 1]?.id)
  ok('B9 caption and name reached the database', saved?.caption === 'Say hi the wind' && saved?.guest_name === 'Sofie', `${saved?.caption} / ${saved?.guest_name}`)
  ok('B10 the polaroid on the phone now shows the text', await b.ev(`/Say hi the wind/.test(document.querySelector('figcaption').textContent)`))
  await b.shot('kamera-saved-390.png')
  ok('B11 no console errors on /kamera', b.errs.length === 0, b.errs.slice(0, 2).join(' | '))
  b.close()
}
```

- [ ] **Step 5: Run suite B**

```bash
node .superpowers/sdd/2026-09-03-minigolf/verify_guest_camera.mjs http://localhost:5173 .superpowers/sdd/2026-09-03-minigolf/cam-out B
```
Expected: `14/14 passed` (B1–B11 plus Z1–Z3). Open `kamera-ready-390.png` and `kamera-caption-390.png` and look at them: a big round shutter, then a polaroid with two fields under it, nothing clipped.

- [ ] **Step 6: Commit**

```bash
git add src/pages/KameraPage.tsx src/App.tsx
git commit -m "Add /kamera: the guest's shoot-and-caption page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: The wall — Billeder

**Files:**
- Create: `src/components/PolaroidWall.tsx`
- Modify: `src/sections/Billeder.tsx` (full replacement below)
- Modify: `src/components/Lightbox.tsx` (show caption and name)
- Modify: harness (append suite C)

**Interfaces:**
- Consumes: `fetchPublishedPhotos(direction)`, `fetchGuestCameraEnabled`, `fetchGalleryOrder` (Task 2), `Polaroid` (Task 7), `QrCode` (Task 8), `useInViewport`, `Lightbox`
- Produces: `<PolaroidWall photos onOpen />`

- [ ] **Step 1: Write the wall**

```tsx
// src/components/PolaroidWall.tsx
import { useEffect, useRef, useState } from 'react'
import { Polaroid } from '@/components/Polaroid'
import { cn } from '@/lib/utils'
import type { Photo } from '@/types'

/**
 * The polaroids, in a loose grid rather than the fully overlapping pile of
 * the reference image: a pile hides half the photos and breaks tap targets
 * once there are forty of them. The per-photo tilt and offset do the
 * "scattered" work while every print stays visible and tappable.
 *
 * Photos that were not in the previous render fade in, which is what makes
 * the wall visibly grow on a screen at the party.
 */
export function PolaroidWall({ photos, onOpen }: { photos: Photo[]; onOpen: (index: number) => void }) {
  const seen = useRef<Set<string>>(new Set())
  const [fresh, setFresh] = useState<Set<string>>(new Set())

  useEffect(() => {
    const incoming = new Set(photos.filter((p) => !seen.current.has(p.id)).map((p) => p.id))
    if (seen.current.size > 0 && incoming.size > 0) {
      setFresh(incoming)
      const t = setTimeout(() => setFresh(new Set()), 1200)
      return () => clearTimeout(t)
    }
    return undefined
  }, [photos])
  useEffect(() => {
    for (const p of photos) seen.current.add(p.id)
  }, [photos])

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((photo, index) => (
        <button
          key={photo.id}
          onClick={() => onOpen(index)}
          className={cn(
            'block text-left transition-opacity duration-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600',
            fresh.has(photo.id) ? 'animate-[fadeIn_700ms_ease-out]' : '',
          )}
          aria-label={photo.caption ?? 'Billede fra konfirmationen'}
        >
          <Polaroid
            id={photo.id}
            url={photo.url}
            caption={photo.caption}
            guestName={photo.guest_name}
            width={photo.width}
            height={photo.height}
          />
        </button>
      ))}
    </div>
  )
}
```

Add the keyframe to `src/index.css` (anywhere at top level, after the `@theme` block):

```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
```

- [ ] **Step 2: Replace `Billeder.tsx`**

```tsx
// src/sections/Billeder.tsx
import { Camera } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Container } from '@/components/Container'
import { Lightbox } from '@/components/Lightbox'
import { PolaroidWall } from '@/components/PolaroidWall'
import { QrCode } from '@/components/QrCode'
import { Reveal } from '@/components/Reveal'
import { SectionHeading } from '@/components/SectionHeading'
import { useInViewport } from '@/hooks/useInViewport'
import { fetchGalleryOrder, fetchGuestCameraEnabled } from '@/lib/api/guestCameraSettings'
import { fetchPublishedPhotos } from '@/lib/api/photos'
import type { GalleryDirection, Photo } from '@/types'

/** How often the wall re-fetches while the camera is on and the wall is on screen. */
const REFRESH_MS = 15_000

export function Billeder() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [cameraOn, setCameraOn] = useState(false)
  const [direction, setDirection] = useState<GalleryDirection>('newest')
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const { ref, isVisible } = useInViewport<HTMLElement>({ rootMargin: '200px' })

  const load = useCallback(async () => {
    const [enabled, order] = await Promise.all([fetchGuestCameraEnabled(), fetchGalleryOrder()])
    setCameraOn(enabled)
    setDirection(order)
    setPhotos(await fetchPublishedPhotos(order))
  }, [])

  useEffect(() => {
    let cancelled = false
    load().finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [load])

  // Live only while it matters: camera on AND the wall on screen. A page left
  // open in a background tab or scrolled past does not poll.
  useEffect(() => {
    if (!cameraOn || !isVisible) return undefined
    const t = setInterval(() => { load().catch(() => {}) }, REFRESH_MS)
    return () => clearInterval(t)
  }, [cameraOn, isVisible, load])

  const kameraUrl = typeof window === 'undefined' ? '/kamera' : `${window.location.origin}/kamera`

  return (
    <section id="billeder" ref={ref} className="scroll-mt-24 bg-cream-100 py-24 sm:py-32">
      <Container>
        <SectionHeading eyebrow="Billeder" title="Billeder fra dagen" align="center" />

        {cameraOn && (
          <Reveal className="mx-auto mt-10 flex max-w-md flex-col items-center gap-4 text-center">
            <QrCode value={kameraUrl} size={160} className="rounded-lg bg-white p-2 shadow-card" />
            <p className="text-ink-600">Scan koden, tag et billede, og se det dukke op her.</p>
            <Link
              to="/kamera"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink-900 px-6 text-sm font-medium text-cream-50 shadow-card hover:bg-green-900"
            >
              <Camera size={18} aria-hidden />
              Tag et billede
            </Link>
          </Reveal>
        )}

        {!isLoading && photos.length === 0 && (
          <Reveal className="mx-auto mt-14 flex max-w-md flex-col items-center gap-4 text-center">
            {!cameraOn && (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700">
                <Camera size={24} />
              </div>
            )}
            <p className="text-lg text-ink-600">
              {cameraOn
                ? 'Vær den første. Tag et billede, så hænger det her om et øjeblik.'
                : 'Billederne fra dagen kommer her efter festen. Vi glæder os til at dele dem med jer!'}
            </p>
          </Reveal>
        )}

        {photos.length > 0 && (
          <div className="mt-14">
            <PolaroidWall photos={photos} onOpen={setOpenIndex} />
          </div>
        )}
      </Container>

      {openIndex !== null && (
        <Lightbox photos={photos} index={openIndex} onClose={() => setOpenIndex(null)} onNavigate={setOpenIndex} />
      )}
    </section>
  )
}
```

`direction` is read so the wall order follows the admin setting on every refresh; it is not otherwise displayed.

- [ ] **Step 3: Show the caption in the lightbox**

In `src/components/Lightbox.tsx`, find the `<img` element inside the dialog (it renders `photo.url`). Immediately after that `<img … />`, add:

```tsx
      {(photo.caption || photo.guest_name) && (
        <p className="font-hand absolute right-4 bottom-6 left-4 text-center text-2xl text-cream-50" onClick={(e) => e.stopPropagation()}>
          {photo.caption}
          {photo.guest_name && <span className="ml-2 text-cream-50/70">{photo.caption ? `— ${photo.guest_name}` : photo.guest_name}</span>}
        </p>
      )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 5: Append suite C to the harness** (before the cleanup block)

```js
// ===========================================================================
// C. the wall
// ===========================================================================
if (run('C')) {
  console.log('\n== C. Billeder ==')
  await setSwitch(true)
  await setOrder('newest')
  // Three tagged uploads with captions, oldest to newest.
  const ids = []
  for (const cap of ['ZZ first', 'ZZ second', 'ZZ third']) {
    const r = await upload({ w: 4, h: 3 })
    await patch({ id: r.body.id, caption: cap, guest_name: 'Test' })
    ids.push(r.body.id)
    await sleep(1100) // distinct created_at seconds
  }
  let c = await browser(`${BASE}/#billeder`)
  await sleep(5000)
  await c.ev(`document.getElementById('billeder').scrollIntoView(); 1`)
  await sleep(2500)
  const captions = () => c.ev(`JSON.stringify([...document.querySelectorAll('#billeder figcaption')].map(f => f.textContent.trim()))`).then(JSON.parse)
  let caps = await captions()
  ok('C1 the wall renders polaroids with captions and names', caps.some((t) => /ZZ third/.test(t) && /Test/.test(t)), caps.slice(0, 4).join(' | '))
  const zz = caps.filter((t) => /^ZZ/.test(t))
  ok('C2 newest first', zz[0]?.startsWith('ZZ third') && zz[2]?.startsWith('ZZ first'), zz.join(' > '))
  ok('C3 the QR block is shown while the camera is on', await c.ev(`!!document.querySelector('#billeder img[alt^="QR-kode"]') && /Tag et billede/.test(document.getElementById('billeder').innerText)`))
  ok('C4 the QR encodes /kamera on this origin', await c.ev(`document.querySelector('#billeder img[alt^="QR-kode"]').alt.endsWith('/kamera')`))
  const tilts = await c.ev(`JSON.stringify([...document.querySelectorAll('#billeder figure')].slice(0,6).map(f => f.style.transform))`).then(JSON.parse)
  ok('C5 each polaroid has a fixed tilt within ±4°', tilts.length > 0 && tilts.every((t) => { const m = /rotate\((-?[\d.]+)deg\)/.exec(t); return m && Math.abs(Number(m[1])) <= 4 }), tilts[0])
  await c.shot('wall-1440.png')

  // Pin the oldest, flip to oldest-first: pinned must lead, then chronological.
  await fetch(`${SB}/rest/v1/photos?id=eq.${ids[2]}`, { method: 'PATCH', headers: H, body: JSON.stringify({ is_pinned: true }) })
  await setOrder('oldest')
  await sleep(16500) // one refresh interval
  caps = await captions()
  const zz2 = caps.filter((t) => /^ZZ/.test(t))
  ok('C6 the wall refreshed itself and pinned leads, then oldest first', zz2[0]?.startsWith('ZZ third') && zz2[1]?.startsWith('ZZ first') && zz2[2]?.startsWith('ZZ second'), zz2.join(' > '))

  // Lightbox shows the caption.
  await c.ev(`[...document.querySelectorAll('#billeder button')].find(b => /ZZ first/.test(b.textContent)).click()`)
  await sleep(800)
  ok('C7 the lightbox shows the caption and name', await c.ev(`/ZZ first/.test(document.querySelector('[role=dialog]')?.innerText ?? '') && /Test/.test(document.querySelector('[role=dialog]')?.innerText ?? '')`))
  await c.ev(`document.querySelector('[role=dialog] button[aria-label="Luk"]').click()`)

  ok('C8 no console errors on the wall', c.errs.length === 0, c.errs.slice(0, 2).join(' | '))
  c.close()

  // Phone width, and the switch off.
  await setSwitch(false)
  c = await browser(`${BASE}/#billeder`, { width: 390, height: 844, mobile: true })
  await sleep(5000)
  await c.ev(`document.getElementById('billeder').scrollIntoView(); 1`)
  await sleep(2000)
  ok('C9 two columns on a phone', (await c.ev(`getComputedStyle(document.querySelector('#billeder .grid')).gridTemplateColumns.split(' ').length`)) === 2)
  ok('C10 no horizontal overflow at 390 px', await c.ev(`document.documentElement.scrollWidth <= innerWidth`))
  ok('C11 with the camera off the QR block is gone and no polling happens', await c.ev(`!document.querySelector('#billeder img[alt^="QR-kode"]')`))
  await c.shot('wall-390.png')
  c.close()
}
```

- [ ] **Step 6: Run suite C**

```bash
node .superpowers/sdd/2026-09-03-minigolf/verify_guest_camera.mjs http://localhost:5173 .superpowers/sdd/2026-09-03-minigolf/cam-out C
```
Expected: `14/14 passed`. Look at `wall-1440.png` and `wall-390.png`: white-framed polaroids with handwritten captions, visibly tilted, none overlapping another's caption.

- [ ] **Step 7: Commit**

```bash
git add src/components/PolaroidWall.tsx src/sections/Billeder.tsx src/components/Lightbox.tsx src/index.css
git commit -m "Billeder becomes a polaroid wall that grows live while the camera is on

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Admin — the Billeder tab

**Files:**
- Modify: `src/pages/admin/tabs/GalleryTab.tsx` (full replacement below)
- Modify: harness (append suite D)

**Interfaces:**
- Consumes: `fetchAllPhotosAdmin`, `uploadPhoto`, `togglePhotoPublished`, `deletePhoto` (existing), `setPhotoPinned`, `updatePhotoText`, `deleteAllGuestPhotos` (Task 2), the four settings helpers (Task 2), `Polaroid` (Task 7), `QrCode`/`downloadQrPng` (Task 8)

- [ ] **Step 1: Replace `GalleryTab.tsx`**

```tsx
// src/pages/admin/tabs/GalleryTab.tsx
import type { ChangeEvent } from 'react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { Input } from '@/components/FormControls'
import { Polaroid } from '@/components/Polaroid'
import { QrCode, downloadQrPng } from '@/components/QrCode'
import {
  fetchGalleryOrder,
  fetchGuestCameraEnabled,
  setGalleryOrder,
  setGuestCameraEnabled,
} from '@/lib/api/guestCameraSettings'
import {
  deleteAllGuestPhotos,
  deletePhoto,
  fetchAllPhotosAdmin,
  setPhotoPinned,
  togglePhotoPublished,
  updatePhotoText,
  uploadPhoto,
} from '@/lib/api/photos'
import type { GalleryDirection, Photo } from '@/types'

/**
 * The hosts' side of the wall: the switch that lets guests upload at all, the
 * order, the QR code to print, and every photo with pin / show / delete and
 * the text editable in place. Everything writes straight to the database.
 */
export function GalleryTab() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [cameraOn, setCameraOn] = useState(false)
  const [order, setOrder] = useState<GalleryDirection>('newest')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const kameraUrl = `${window.location.origin}/kamera`

  function load() {
    Promise.all([fetchAllPhotosAdmin(), fetchGuestCameraEnabled(), fetchGalleryOrder()])
      .then(([rows, enabled, direction]) => {
        setPhotos(rows)
        setCameraOn(enabled)
        setOrder(direction)
        setError(null)
      })
      .catch((e: unknown) => setError(messageOf(e)))
  }

  useEffect(load, [])

  async function guard(action: () => Promise<unknown>) {
    try {
      await action()
      load()
    } catch (e: unknown) {
      setError(messageOf(e))
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files || files.length === 0) return
    setIsUploading(true)
    try {
      for (const file of Array.from(files)) await uploadPhoto(file)
      load()
    } catch (e: unknown) {
      setError(messageOf(e))
    } finally {
      setIsUploading(false)
      event.target.value = ''
    }
  }

  const guestCount = photos.filter((p) => p.source === 'guest').length

  return (
    <div>
      {/* Control strip */}
      <div className="mb-8 grid gap-4 rounded-xl border border-ink-900/10 bg-cream-50 p-4 sm:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={cameraOn}
              onChange={(e) => guard(() => setGuestCameraEnabled(e.target.checked))}
              className="h-5 w-5 accent-ink-900"
              aria-label="Gæstekamera"
            />
            <span className="font-medium text-ink-900">{cameraOn ? 'Kameraet er tændt' : 'Kameraet er slukket'}</span>
            {cameraOn && <span className="text-sm text-green-700">Gæster kan uploade nu</span>}
          </label>
          <label className="flex items-center gap-3 text-sm text-ink-700">
            Rækkefølge
            <select
              value={order}
              onChange={(e) => guard(() => setGalleryOrder(e.target.value as GalleryDirection))}
              className="rounded border border-ink-900/20 bg-white px-2 py-1"
            >
              <option value="newest">Nyeste først</option>
              <option value="oldest">Ældste først</option>
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex w-fit cursor-pointer items-center gap-3 rounded-full bg-ink-900 px-6 py-3 text-sm font-medium text-cream-50">
              {isUploading ? 'Uploader...' : 'Upload billeder'}
              <input type="file" accept="image/*" multiple onChange={handleUpload} disabled={isUploading} className="hidden" />
            </label>
            {guestCount > 0 && (
              <button
                onClick={() => {
                  if (confirm(`Slet alle ${guestCount} gæstebilleder? Det kan ikke fortrydes.`)) guard(deleteAllGuestPhotos)
                }}
                className="text-sm text-red-700 underline"
              >
                Slet alle gæstebilleder ({guestCount})
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <QrCode value={kameraUrl} size={128} className="rounded bg-white p-1" />
          <Button variant="outline" className="!px-4 !py-2 text-sm" onClick={() => downloadQrPng(kameraUrl, 'victor-kamera-qr.png')}>
            Download til print
          </Button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo) => (
          <PhotoCard key={photo.id} photo={photo} onChange={guard} />
        ))}
      </div>
      {photos.length === 0 && <p className="text-ink-600">Ingen billeder endnu.</p>}
    </div>
  )
}

function PhotoCard({ photo, onChange }: { photo: Photo; onChange: (action: () => Promise<unknown>) => void }) {
  const [caption, setCaption] = useState(photo.caption ?? '')
  const [name, setName] = useState(photo.guest_name ?? '')
  useEffect(() => { setCaption(photo.caption ?? ''); setName(photo.guest_name ?? '') }, [photo.caption, photo.guest_name])

  function saveText() {
    if (caption === (photo.caption ?? '') && name === (photo.guest_name ?? '')) return
    onChange(() => updatePhotoText(photo.id, { caption: caption.trim() || null, guest_name: name.trim() || null }))
  }

  return (
    <div className={photo.is_published ? '' : 'opacity-50'}>
      <Polaroid id={photo.id} url={photo.url} caption={photo.caption} guestName={photo.guest_name} width={photo.width} height={photo.height} tilted={false} />
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className={photo.source === 'guest' ? 'rounded bg-green-100 px-1.5 py-0.5 text-green-800' : 'rounded bg-ink-900/[0.06] px-1.5 py-0.5 text-ink-600'}>
          {photo.source === 'guest' ? 'Gæst' : 'Jer'}
        </span>
        <span className="text-ink-400">{new Date(photo.created_at).toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        <Input value={caption} onChange={(e) => setCaption(e.target.value)} onBlur={saveText} maxLength={120} placeholder="Tekst" aria-label="Tekst" className="!py-1 text-sm" />
        <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveText} maxLength={30} placeholder="Navn" aria-label="Navn" className="!py-1 text-sm" />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <button onClick={() => onChange(() => setPhotoPinned(photo.id, !photo.is_pinned))} className={photo.is_pinned ? 'text-amber-600' : 'text-ink-400'} aria-pressed={photo.is_pinned} aria-label={photo.is_pinned ? 'Fjern fra toppen' : 'Sæt øverst'}>
          {photo.is_pinned ? '★ Øverst' : '☆ Sæt øverst'}
        </button>
        <button onClick={() => onChange(() => togglePhotoPublished(photo.id, !photo.is_published))} className={photo.is_published ? 'text-green-700' : 'text-ink-400'}>
          {photo.is_published ? 'Offentlig' : 'Skjult'}
        </button>
        <button onClick={() => { if (confirm('Slet dette billede?')) onChange(() => deletePhoto(photo.id, photo.storage_path)) }} className="text-red-700">
          Slet
        </button>
      </div>
    </div>
  )
}

/** supabase-js rejects with a plain object, not an Error; read its message either way. */
function messageOf(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') return e.message
  return e instanceof Error ? e.message : 'Noget gik galt.'
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 3: Append suite D to the harness** (before the cleanup block)

Suite D needs a signed-in admin. It creates a temporary auth user, uses it, deletes it — the pattern used for the To-do tab. It **must** target rows by exact title text, never by container `textContent` (that once deleted a real row).

```js
// ===========================================================================
// D. /admin Billeder tab — through a temporary admin user, removed after
// ===========================================================================
if (run('D')) {
  console.log('\n== D. /admin ==')
  const PW = 'zz' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  const created = await fetch(`${SB}/auth/v1/admin/users`, {
    method: 'POST', headers: H, body: JSON.stringify({ email: 'zztest-admin@example.com', password: PW, email_confirm: true }),
  }).then((r) => r.json())
  const userId = created.id
  ok('D0 temporary admin user created', !!userId)

  await setSwitch(false)
  const seeded = await (async () => { await setSwitch(true); const r = await upload({ w: 4, h: 3 }); await patch({ id: r.body.id, caption: 'ZZ admin row' }); await setSwitch(false); return r.body.id })()

  const d = await browser(`${BASE}/admin`)
  await sleep(4000)
  await d.ev(`(async () => {
    let e = null; for (let i = 0; i < 40 && !e; i++) { e = document.querySelector('input[type=email]'); if (!e) await new Promise(r => setTimeout(r, 300)) }
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    set.call(e, 'zztest-admin@example.com'); e.dispatchEvent(new Event('input', { bubbles: true }))
    const p = document.querySelector('input[type=password]'); set.call(p, ${JSON.stringify(PW)}); p.dispatchEvent(new Event('input', { bubbles: true }))
    ;[...document.querySelectorAll('button')].find(b => /Log ind/i.test(b.textContent)).click()
  })()`)
  await sleep(6000)
  await d.ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Billeder').click()`)
  await sleep(3000)

  ok('D1 the switch shows off', await d.ev(`/Kameraet er slukket/.test(document.body.innerText)`))
  ok('D2 the QR code and print download are there', await d.ev(`!!document.querySelector('img[alt^="QR-kode"]') && /Download til print/.test(document.body.innerText)`))

  await d.ev(`document.querySelector('input[aria-label="Gæstekamera"]').click()`)
  await sleep(2000)
  const switchedOn = await fetch(`${SB}/rest/v1/site_settings?key=eq.guest_camera&select=value`, { headers: H }).then((r) => r.json())
  ok('D3 ticking the switch turns the camera on in the database', switchedOn[0]?.value?.enabled === true)
  ok('D4 and the tab says so', await d.ev(`/Kameraet er tændt/.test(document.body.innerText) && /Gæster kan uploade nu/.test(document.body.innerText)`))

  // The seeded row: badge, pin, text edit — matched by its exact caption.
  const card = () => `[...document.querySelectorAll('figure')].find(f => f.querySelector('figcaption').textContent.trim() === 'ZZ admin row')?.parentElement`
  ok('D5 the guest photo shows the Gæst badge', await d.ev(`/Gæst/.test((${card()})?.innerText ?? '')`))
  await d.ev(`(${card()}).querySelector('button[aria-label="Sæt øverst"]').click()`)
  await sleep(2000)
  const pinned = await fetch(`${SB}/rest/v1/photos?id=eq.${seeded}&select=is_pinned`, { headers: H }).then((r) => r.json())
  ok('D6 pinning writes is_pinned', pinned[0]?.is_pinned === true)

  await d.ev(`(() => {
    const c = ${card()}
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    const cap = c.querySelector('input[aria-label="Tekst"]')
    set.call(cap, 'ZZ edited by host'); cap.dispatchEvent(new Event('input', { bubbles: true })); cap.blur(); cap.dispatchEvent(new Event('blur'))
  })()`)
  await sleep(2000)
  const edited = await fetch(`${SB}/rest/v1/photos?id=eq.${seeded}&select=caption`, { headers: H }).then((r) => r.json())
  ok('D7 editing the caption inline saves it', edited[0]?.caption === 'ZZ edited by host', edited[0]?.caption)

  await d.ev(`document.querySelector('select').value = 'oldest'; document.querySelector('select').dispatchEvent(new Event('change', { bubbles: true }))`)
  await sleep(2000)
  const ord = await fetch(`${SB}/rest/v1/site_settings?key=eq.gallery_order&select=value`, { headers: H }).then((r) => r.json())
  ok('D8 the order select writes gallery_order', ord[0]?.value?.direction === 'oldest')
  await setOrder('newest')

  await d.ev(`window.confirm = () => true; [...document.querySelectorAll('button')].find(b => /Slet alle gæstebilleder/.test(b.textContent)).click()`)
  await sleep(3000)
  const left = await guestRows()
  ok('D9 "Slet alle gæstebilleder" removes every guest row', left.length === 0, `${left.length} left`)
  await d.shot('admin-billeder-1440.png')
  ok('D10 no console errors in /admin', d.errs.length === 0, d.errs.slice(0, 2).join(' | '))
  d.close()

  await setSwitch(false)
  const del = await fetch(`${SB}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: H }).then((r) => r.status)
  ok('D11 temporary admin user deleted', del === 200)
}
```

- [ ] **Step 4: Run suite D**

```bash
node .superpowers/sdd/2026-09-03-minigolf/verify_guest_camera.mjs http://localhost:5173 .superpowers/sdd/2026-09-03-minigolf/cam-out D
```
Expected: `15/15 passed`. Then confirm the temp user is really gone:
```bash
export $(grep -E '^(VITE_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' .env | xargs)
curl -s "$VITE_SUPABASE_URL/auth/v1/admin/users" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | grep -c zztest
```
Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/tabs/GalleryTab.tsx
git commit -m "Admin Billeder tab: camera switch, order, QR download, pin, inline text, bulk guest delete

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Full run, production build, deploy, smoke

**Files:** none new.

- [ ] **Step 1: Run every pure test and the whole harness**

```bash
node --disable-warning=ExperimentalWarning --test api/_lib/text.test.ts api/_lib/upload.test.ts src/lib/imageFit.test.ts src/lib/polaroidTilt.test.ts
node .superpowers/sdd/2026-09-03-minigolf/verify_guest_camera.mjs http://localhost:5173 .superpowers/sdd/2026-09-03-minigolf/cam-out all
```
Expected: `ℹ pass 19` / `ℹ fail 0` for the pure tests (5 + 6 + 4 + 4); the harness ends `55/55 passed` (A 18, B 11, C 11, D 12, cleanup 3). The camera switch must be back to off at the end (Z3 says `off`).

- [ ] **Step 2: Production build and bundle checks**

```bash
npm run build 2>&1 | grep -E "built in|error"
grep -c "Kameraet åbner til festen" dist/assets/index-*.js
grep -c "SUPABASE_SERVICE_ROLE_KEY\|service_role" dist/assets/*.js
```
Expected: built, `1` (the page is in the bundle), `0` (no server secret names in the client).

- [ ] **Step 3: Regression on what already existed**

The existing suites must still pass — the wall replaced a section and the Photo type changed:
```bash
node .superpowers/sdd/2026-09-03-minigolf/verify_leaderboard.mjs http://localhost:5173 .superpowers/sdd/2026-09-03-minigolf/lb-final
```
Expected: `24/24 passed`.

- [ ] **Step 4: Confirm the tree is clean and deploy**

```bash
git status --short   # expected: empty
git push origin main
```
Then wait for the new bundle:
```bash
OLD=$(curl -s https://victor.neergaard.nu/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)
until [ "$(curl -s https://victor.neergaard.nu/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)" != "$OLD" ]; do sleep 8; done
```

- [ ] **Step 5: Production smoke**

```bash
curl -s -o /dev/null -w "%{http_code} /kamera\n" https://victor.neergaard.nu/kamera
curl -s -X POST https://victor.neergaard.nu/api/photos/guest -H 'content-type: image/jpeg' -H 'x-image-width: 1' -H 'x-image-height: 1' --data-binary @.superpowers/sdd/2026-09-03-minigolf/cam-out/test-shot.jpg
```
Expected: `200 /kamera`, and the route answers `{"ok":false,"error":"Kameraet er slukket."}` — the switch is off in production, and the route is the thing enforcing it.

Then in a browser (the `browser()` helper from the harness, or the Browser pane) load `https://victor.neergaard.nu/kamera` at 390 px and confirm it shows *Kameraet åbner til festen*; load `https://victor.neergaard.nu/#billeder` and confirm existing photos render as polaroids with no console errors. Save both screenshots.

- [ ] **Step 6: Report**

Tell the owner: the deployed commit SHA, that the camera is **off** in production, how to test (switch on in /admin → scan the QR → shoot → *Slet alle gæstebilleder* → switch off), and that the QR PNG is downloadable from the Billeder tab for printing.

---

## Self-review

**Spec coverage.** §1 capture page → Task 9 (three states, resize, caption step, errors). §2 migration and settings → Task 1; ordering → Task 2. §3 route: switch, rate limit, validate, store, PATCH, errors → Task 5 (with Tasks 3–4 as its helpers). §4 wall: Polaroid, tilt, layout, lightbox caption, polling, QR block, empty states → Tasks 7, 8, 10. §5 admin: switch, order, QR download, pin, inline text, badge, bulk delete → Task 11. §6 security: enforced in Task 5's route (switch server-side, no anon write, hash), Task 6 (EXIF via re-encode), Task 10/11 (text rendered as text). §7 testing: pure tests in 3, 4, 6, 7; suites A–D in 5, 9, 10, 11; production smoke in 12. Files table: every file appears in a task. No gaps found.

**Placeholders.** None: every code step has the code, every run step has the command and the expected result.

**Type consistency.** `fetchPublishedPhotos(direction)` (Task 2) is called with `order` in Task 10. `setPhotoPinned`, `updatePhotoText`, `deleteAllGuestPhotos` (Task 2) are used with the same signatures in Task 11. `resizeForUpload` returns `{ blob, width, height }` and `uploadGuestPhoto` takes exactly that (Task 6, used in Task 9). `Polaroid` props (Task 7) match every call in Tasks 9, 10, 11 (`id, url, caption, guestName, width, height, tilted`). `QrCode` / `downloadQrPng` (Task 8) match Tasks 10 and 11. `GalleryDirection` is exported from `src/types/index.ts` (Task 2) and imported from there everywhere.
