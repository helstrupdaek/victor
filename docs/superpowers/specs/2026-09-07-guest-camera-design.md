# Guest camera and polaroid wall — design

Guests scan a QR code, their phone opens the camera, the photo lands on the
website's Billeder section as a polaroid within seconds, and they can write a
line under it. The hosts switch the whole thing on and off from /admin, pin
favourites, and choose the order.

Approved in conversation on 2026-09-07. This document is the reference for the
implementation plan; where it and a conversation differ, this wins.

## Goal

A "disposable camera" for the party, in the style of knipsmig.com, built into
this site rather than bought: no app to install, no account, no third party.
Scan → shoot → it's on the wall.

## Non-goals

- No installable app or PWA. The flow is a web page; installing anything
  makes it slower, not better.
- No guest accounts, per-guest galleries, likes, or comments.
- No moderation queue. Photos go live immediately (decided); the hosts hide or
  delete afterwards.
- No editing of a polaroid's text by anyone but its photographer (at upload)
  and the hosts (in /admin). The wall is not a guestbook.
- No drag-to-reorder. Order is pinned-first, then newest- or oldest-first.
- No server-side image processing library. Resizing happens on the phone.
- No real-time push. The wall polls while the camera is on.

## Decisions already made

| Question | Decision |
|---|---|
| Moderation | Live immediately; hosts hide/delete after |
| Sorting | Newest/oldest toggle plus pin-to-front |
| Wall vs existing grid | One wall; every published photo is a polaroid, the grid is removed |
| Captions | Photographer writes it right after upload; hosts can edit in /admin |
| Upload path | Through a service-key API route, never direct to storage |

## 1. The guest flow — `/kamera`

A route on the site with no site navigation, designed for a phone held in one
hand. Three states, one screen.

**Camera on.** A single large button, *Tag et billede*. It is a file input with
`accept="image/*" capture="environment"`, which on iOS Safari and Android
Chrome opens the rear camera directly with no in-page viewfinder. When the OS
hands back the image, the page:

1. Decodes it and draws it to a canvas scaled so the long side is at most
   **2000 px**, exported as **JPEG at quality 0.85**. This is not optional: a
   modern phone photo is 5–12 MB and Vercel's request body limit is 4.5 MB. The
   re-encode also drops all EXIF, including GPS, which is a privacy improvement
   guests get for free.
2. Shows the polaroid frame with the photo in it and an uploading state.
3. `POST`s it to `/api/photos/guest` (section 3).

**Caption.** On success the polaroid stays on screen with two optional fields
under it — a text line (placeholder *Skriv noget under billedet*, max 120
characters) and a first name (max 30) — and a *Gem* button. Saving `PATCH`es
the caption onto the photo it just uploaded. Skipping is fine: the photo is
already on the wall. *Tag et til* returns to the start.

**Camera off.** The page shows only: *Kameraet åbner til festen.* This is what
someone sees if they scan a printed code the week before, or after the hosts
switch it off. The page reads `site_settings.guest_camera` on load; the API
enforces the same rule server-side (section 3).

**Errors** are one Danish sentence each and a retry: the file is not an image;
the file is too large even after resizing; the network dropped; the camera is
off; too many uploads. Never a raw error string.

## 2. Data

### Migration `0007_guest_camera.sql`

Extends the existing `public.photos` table; nothing is renamed or removed.

```sql
alter table public.photos
  add column if not exists source      text    not null default 'admin'
    check (source in ('admin', 'guest')),
  add column if not exists guest_name  text,
  add column if not exists is_pinned   boolean not null default false,
  add column if not exists uploader_hash text;
```

- `source` defaults to `'admin'` so every existing row keeps its meaning.
- `guest_name` is the optional first name from the caption step.
- `is_pinned` puts a photo at the front of the wall.
- `uploader_hash` is an HMAC of the uploading IP (section 3, rate limit). It is
  never shown anywhere and is not reversible.

Two `site_settings` rows, both `is_public = true` so the anon client on
`/kamera` and Billeder can read them (the existing
`site_settings_public_select` policy):

```sql
insert into public.site_settings (key, value, is_public) values
  ('guest_camera',  '{"enabled": false}',        true),
  ('gallery_order', '{"direction": "newest"}',   true)
on conflict (key) do nothing;
```

The migration is idempotent and ends with a self-check `select`, like 0005 and
0006, printing `has_source | has_pinned | has_switch | has_order` — all `t` on
a good run.

### Existing pieces reused

- `public.photos` columns `caption`, `is_published`, `created_at`, `width`,
  `height`, `storage_path`.
- The public `gallery` storage bucket. Guest files go under `guest/<uuid>.jpg`.
- RLS: anon can select published photos (this is how Billeder works today);
  only `authenticated` can write via the client. Guest writes never use the
  client — they go through the route below with the service key.

### Ordering, everywhere the wall is read

```
order by is_pinned desc, created_at <asc|desc>
```

with the direction from `gallery_order.direction`. `sort_order` stays in the
table but no longer orders anything.

## 3. The upload route — `api/photos/guest.ts`

One Vercel function, service key, two methods. Same skeleton as
`api/minigolf/*.ts` (`readJsonBody`/`sendJson` from `api/_lib/http.js`,
`getSupabaseAdmin`).

### `POST /api/photos/guest`

The resized JPEG **as the raw request body** with `Content-Type: image/jpeg`,
and the phone-measured dimensions as `X-Image-Width` / `X-Image-Height`
headers. Not multipart: parsing multipart on Vercel needs a dependency, a raw
body needs none, and the text already has its own `PATCH` below — so the
upload carries no caption or name at all. Vercel hands the body to the
function pre-read as a `Buffer`; the local dev plugin hands a stream; the route
reads either. In order:

1. **Switch.** Read `site_settings.guest_camera` fresh from the database. If
   not enabled → `403 { error: 'Kameraet er slukket.' }`. The UI hiding the
   button is not the enforcement; this is.
2. **Rate limit.** `uploader_hash = hmac_sha256(SUPABASE_SERVICE_ROLE_KEY,
   client_ip)`, hex, first 32 chars. Count `photos` rows with that hash and
   `created_at > now() - 10 minutes`. If ≥ **20** → `429`. Vercel functions are
   stateless, so the count lives in the table rather than in memory. The key
   is already a server secret; no new env var. The client IP is
   `x-forwarded-for`'s first entry, which Vercel sets.
3. **Validate.** Content type must be `image/jpeg`, `image/png` or
   `image/webp` (`415` otherwise); size ≤ **4 MB** (`413`); the two dimension
   headers must be positive integers (`400` otherwise).
4. **Store.** Upload to bucket `gallery` at `guest/<uuid>.jpg` with
   `cacheControl: '31536000'`. Insert the `photos` row: `source = 'guest'`,
   `is_published = true`, `is_pinned = false`, width/height from the headers
   (the phone measured the canvas), `caption` and `guest_name` null until the
   `PATCH`, `uploader_hash`.
5. Respond `201 { ok: true, id }`.

### `PATCH /api/photos/guest`

JSON body `{ id, caption?, guest_name? }`. Updates only rows where
`source = 'guest'`; anything else → `404`. The id is a UUID the route itself
issued and the page holds in memory, so a guest can only reach the photo they
just took; nobody can enumerate or guess ids. The same sanitising and length
caps apply. This route cannot change `is_published`, `is_pinned`, or delete —
those are admin-only through the authenticated client.

### Errors

Every non-2xx is `{ ok: false, error: <Danish sentence> }`, and the page shows
that sentence. Storage or database failures → `500` with a generic sentence;
the detail is logged server-side only.

## 4. The wall — Billeder

`src/sections/Billeder.tsx` drops the masonry grid and renders `PolaroidWall`.

**Data.** `fetchPublishedPhotos()` gains the ordering above. `Photo` gains
`source`, `guest_name`, `is_pinned`.

**Polaroid** (`src/components/Polaroid.tsx`): white frame, image on top, a
deeper bottom band. Caption in **Caveat** (added to the existing Google Fonts
link in `index.html`; falls back to the cursive system stack). Guest name, when
present, smaller and lighter after the caption: *Say hi the wind — Sofie*. Tilt
is deterministic — a hash of the photo id mapped to −4°…+4°, plus an offset of
up to ±6 px — so the wall never jitters on refresh. Uses the stored
width/height so images do not shift layout as they load; `loading="lazy"`.

**Layout — a deliberate deviation from the reference image.** The reference is
a fully overlapping pile, a static composition. With dozens of guest photos it
hides half of them and breaks tap targets. So the wall is a loose grid — two
columns on phones, three at `sm`, four at `lg` — with the tilts and offsets
doing the "scattered" work. Every photo fully visible and tappable.

**Lightbox.** The existing `Lightbox` opens on tap and shows caption and name.

**Live refresh.** While `guest_camera.enabled` is true *and* the section is in
the viewport (existing `useInViewport` hook), re-fetch every **15 s**. New
photos appear at the front or back per the order setting, with a short fade.
When the switch is off there is no polling.

**Above the wall, only while the camera is on:** the QR code (encodes
`<origin>/kamera`), the line *Scan koden, tag et billede, og se det dukke op
her*, and a *Tag et billede* link to `/kamera` for people already on a phone.

**Empty states.** Camera on, no photos: *Vær den første — tag et billede.*
Camera off, no photos: the existing *Billederne fra dagen kommer her efter
festen…* line, unchanged.

**QR generation.** The `qrcode` npm package (≈30 KB): `toString({ type: 'svg'
})` for the inline code, `toDataURL` at 1024 px for the admin download. The one
new dependency in this feature.

## 5. Admin — the Billeder tab

`GalleryTab` gains a control strip and richer rows. Everything goes through
the authenticated client under existing RLS.

**Control strip**

- **Switch** — *Kameraet er slukket* / *Kameraet er tændt*, with *Gæster kan
  uploade nu* shown while on. Writes `site_settings.guest_camera`.
- **Order** — *Nyeste først* / *Ældste først*. Writes `gallery_order`.
- **QR code** with **Download til print** (1024 px PNG via `<a download>`).

**Rows** — each photo as a small polaroid thumbnail with: **pin** (star), the
existing **show/hide** and **delete**, **caption** editable inline, **guest
name** shown and editable, a *Gæst* / *Jer* badge from `source`, and the time.
The existing upload button is unchanged; admin uploads get `source = 'admin'`.

**Slet alle gæstebilleder** — behind a confirm naming the count. Deletes every
`source = 'guest'` row and its storage object. This is what makes testing
before the party clean: switch on → scan → shoot → see it land → *Slet alle
gæstebilleder* → switch off.

## 6. Security and privacy

- Guests never get a Supabase key with write access. The anon key reads
  published photos and two public settings, as today; all guest writes go
  through the service-key route.
- The switch is enforced in the route, not the UI. Off means the route refuses.
- Rate limit per IP, hashed and salted with a server secret; the hash is never
  exposed and cannot be reversed.
- Client-side re-encode strips EXIF, including location.
- The bucket is already public-read (existing decision); a hidden photo is not
  linked anywhere but is fetchable by anyone who has its exact URL, exactly as
  today. Delete removes the file.
- Caption and name are sanitised on write and rendered as text, never HTML.

## 7. Testing

Same approach as the minigolf suites: a headless browser against the real dev
server and the real Supabase project, with tagged test data cleaned up.

**Migration** — self-verifying select at the end of the file.

**API, hit directly** — switch off → 403; switch on, wrong type → 415;
oversize → 413; good upload → 201 and a row with `source='guest'`; 21st upload
from one IP inside 10 min → 429; `PATCH` with an unknown id → 404; `PATCH`
with the issued id → caption and name saved and sanitised; `PATCH` cannot set
`is_published`.

**Browser** — in `/admin`: turn the switch on; on `/kamera` (390 px
viewport): upload a real JPEG through the file input, see the polaroid and the
caption fields, save a caption; on Billeder: the photo is on the wall with its
caption and name, in the right position; pin it in `/admin` and see it move to
the front; flip the order and see the wall reverse; turn the switch off and
confirm `/kamera` shows *Kameraet åbner til festen* and the QR block is gone
from Billeder; *Slet alle gæstebilleder* removes the test rows and files.
Console clean throughout. Screenshots of `/kamera` and the wall at 390 px and
1440 px.

**Production smoke, after deploy** — `/kamera` loads with the switch off and
says so; the route returns 403; the wall renders existing photos as polaroids.

## Files

| File | Change |
|---|---|
| `supabase/migrations/0007_guest_camera.sql` | new |
| `api/photos/guest.ts` | new — POST and PATCH |
| `src/pages/KameraPage.tsx` | new |
| `src/App.tsx` | route `/kamera` |
| `src/lib/guestCamera.ts` | new — resize on phone, call the route |
| `src/lib/api/photos.ts` | ordering; pin, caption/name update, bulk guest delete |
| `src/lib/api/siteSettings.ts` | unchanged (used for the two settings) |
| `src/components/Polaroid.tsx` | new |
| `src/components/PolaroidWall.tsx` | new |
| `src/components/QrCode.tsx` | new |
| `src/sections/Billeder.tsx` | wall replaces grid; QR block; polling |
| `src/pages/admin/tabs/GalleryTab.tsx` | control strip; richer rows; bulk delete |
| `src/types/index.ts` | `Photo` gains `source`, `guest_name`, `is_pinned` |
| `index.html` | Caveat in the Google Fonts link |
| `package.json` | `qrcode` |
| `.superpowers/sdd/.../verify_guest_camera.mjs` | new harness (ignored dir) |

## Numbers, all in one place

| | |
|---|---|
| Max long side after resize | 2000 px |
| JPEG quality | 0.85 |
| Server size cap | 4 MB |
| Caption / name max | 120 / 30 chars |
| Rate limit | 20 uploads per IP per 10 min |
| Wall refresh while on | every 15 s, only when in view |
| Tilt / offset | ±4° / ±6 px, fixed per photo |
| QR download | 1024 px PNG |
