# Victors konfirmation — 1. maj 2027

Digital invitation and RSVP site for Victor's confirmation. React + TypeScript
+ Vite + Tailwind CSS, with Supabase for RSVP/wishlist/gallery/admin and
Resend for the confirmation email + calendar invite.

## Stack

- **Vite + React 19 + TypeScript**
- **Tailwind CSS v4** (via `@tailwindcss/vite`)
- **React Router** — only `/admin` is a real route; everything else is one
  scrolling page with anchor-linked sections
- **Supabase** — Postgres + Auth + Storage (optional — see "Demo mode" below)
- **Vercel serverless functions** (`/api`) — confirmation email + `.ics`
  generation; the only server-side code in the project
- **Resend** — transactional email
- **Open-Meteo** — free, keyless weather API for the Vejret section

## Getting started

```bash
npm install
npm run dev
```

`npm run dev` also runs the `/api` routes locally (see "Email & calendar
invite" below) — no separate server or `vercel dev` needed.

### The hero video

Place the confirmation video at:

```
public/videos/victor-hero.mp4
```

It should show Victor turning his head horizontally — the hero scrubs
through it based on horizontal mouse position (or a gentle automatic drift
on touch devices). See `src/hooks/useVideoScrub.ts` for the interaction and
`src/sections/Hero.tsx` for the `HERO_VIDEO_OBJECT_POSITION` constant if you
need to reposition Victor within the frame (e.g. on tall mobile crops).

Optionally add a poster frame (a single JPG extracted from the video) at
`public/images/victor-hero-poster.jpg` — shown while the video loads. E.g.:

```bash
ffmpeg -i public/videos/victor-hero.mp4 -ss 00:00:02 -vframes 1 public/images/victor-hero-poster.jpg
```

### Demo mode (no Supabase required)

If `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` aren't set, the site runs
in **demo mode**: RSVP submissions, gift reservations, and photo uploads are
stored in the browser's `localStorage` instead of a real database, so
everything is still genuinely interactive for local development or a quick
preview deploy. `/admin` shows a notice explaining that real admin auth
needs Supabase configured — there's no fake login in demo mode. The
confirmation email always requires real Supabase + Resend credentials (see
below), even in demo mode, since it's inherently a real-backend feature.

Demo data resets if `localStorage` is cleared and is never shared between
visitors — for a real event, connect Supabase (next section).

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run, **in order**:
   - [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) —
     all tables, RLS policies, the `gallery` storage bucket, and seed data.
   - [`supabase/migrations/0002_event_info_and_gift_email.sql`](supabase/migrations/0002_event_info_and_gift_email.sql) —
     adds `guest_email` to gift reservations (so a reservation can be linked
     to an RSVP), a security-definer RPC guests use to see their own
     reserved gifts, and the real event details (church, party address,
     RSVP deadline).
3. Copy `.env.example` to `.env` and fill in:
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Project Settings → API
     → "Project URL" / "anon public" key.
   - `SUPABASE_SERVICE_ROLE_KEY` — same page, "service_role" **secret** key.
     Server-only (used by `/api` to send the confirmation email regardless
     of RLS) — never put this in a `VITE_`-prefixed variable or client code.

   ```bash
   cp .env.example .env
   ```

4. Create an admin user: Supabase dashboard → Authentication → Users → Add
   user. Use that email/password to log in at `/admin`. There's no
   separate "admin" table — anyone with a Supabase Auth session for this
   project can use the dashboard, so only create accounts you trust.
5. Restart `npm run dev`.

### How access control works

- **RSVP**: anyone can create/update their own row (by email), nobody can
  read the guest list except an authenticated (admin) session or the
  server (service-role key, used only by `/api/send-confirmation` and
  `/api/calendar-invite`).
- **Wishlist**: publicly readable; only an authenticated session can
  create/edit/delete items.
- **Gift reservations**: anyone can reserve an unreserved gift (a unique
  database constraint prevents two guests ever reserving the same one,
  even if they click at the same time). Nobody — not even the public
  wishlist API — can list *who* reserved what; only an authenticated
  session, or the guest themself via a security-definer RPC scoped to
  their own email, can. Releasing a reservation is done with the private
  `reservation_token` returned when it was created (the browser remembers
  it, plus the email if one was given, in `localStorage` so a returning
  guest sees a "fortryd" option automatically).
- **Photos**: only rows marked `is_published` are publicly visible;
  uploading/publishing/deleting requires an authenticated session.
- **Site settings** (event info, timeline, practical info, venue location):
  only rows marked `is_public` are publicly readable; editing requires an
  authenticated session.

Full schema and policies: [`0001_init.sql`](supabase/migrations/0001_init.sql),
[`0002_event_info_and_gift_email.sql`](supabase/migrations/0002_event_info_and_gift_email.sql).

## Email & calendar invite (Resend)

When a guest submits the RSVP form (or later reserves/releases a gift under
an email that already has an RSVP), the browser calls
`/api/send-confirmation`, which:

1. Looks up that email's RSVP + reserved gifts directly in Supabase using
   the service-role key (bypasses RLS — this is trusted server code).
2. Builds a Danish HTML+text confirmation email
   (`api/_lib/emailTemplate.ts`) and a standards-compliant `.ics` file
   (`api/_lib/ics.ts`).
3. Sends it via Resend, with the `.ics` attached and a "Tilføj til
   kalender" button linking to `/api/calendar-invite?email=...`, which
   regenerates and serves the same file on demand.

If the email doesn't match an existing RSVP (e.g. someone reserved a gift
before RSVPing), this is a silent no-op — not an error — so it never sends
a broken email. If Resend/Supabase aren't configured, the RSVP itself still
succeeds; the site shows a small "we couldn't email you" note instead of
failing.

**No church time yet?** The `.ics` file is generated as an all-day event
for 1 May 2027 whenever `churchStartTime` is empty in `/admin` → Begivenhed
(or the `event_info` row) — never a made-up time. Once a start time is set
there, new `.ics` files use it (defaulting to a 1-hour block if no end time
is set either).

### Setup

1. Create an account at [resend.com](https://resend.com).
2. **Verify a sending domain**: Resend dashboard → Domains → Add Domain →
   add the shown DNS records (SPF/DKIM, usually TXT + CNAME) at your
   domain's DNS provider. This can take a few minutes to a few hours to
   verify. Until a domain is verified, Resend only lets you send to your
   own account email — fine for testing, not for real guests.
3. Create an API key: Resend dashboard → API Keys.
4. Set in `.env`:
   - `RESEND_API_KEY` — the key from step 3.
   - `EMAIL_FROM` — e.g. `Victors konfirmation <hej@dit-domæne.dk>`, using
     your verified domain from step 2.

## Environment variables

| Variable                    | Required | Description                                            |
| ---------------------------- | -------- | ------------------------------------------------------- |
| `VITE_SUPABASE_URL`          | No\*     | Supabase project URL                                    |
| `VITE_SUPABASE_ANON_KEY`     | No\*     | Supabase anon/public key                                |
| `SUPABASE_SERVICE_ROLE_KEY`  | No\*\*   | Server-only. Needed for the confirmation email/.ics      |
| `RESEND_API_KEY`             | No\*\*   | Server-only. Needed for the confirmation email           |
| `EMAIL_FROM`                 | No\*\*   | Server-only. Verified sender address (see Resend setup)  |

\* Omitting both Supabase client vars runs the site in demo mode (see
above). For a real event, set both.

\*\* Omitting any of these disables the confirmation email/.ics — the RSVP
form and everything else still works. All three are required together for
email to actually send.

## Content that's placeholder data

Search the codebase for `PLACEHOLDER` to find everything that still needs
real information before launch (parking, dress code, contact person,
accommodation — the church, party address, date and RSVP deadline are
already filled in with real values):

- `src/data/practicalInfo.ts` / the `practical_info` row in `site_settings`
- `src/data/wishlist.ts` — demo-mode-only sample wishes

The event's core facts (church, party address, RSVP deadline, invitation
text, church start time once known) live in `src/data/eventInfo.ts` as the
fallback and in the `event_info` row of `site_settings` as the live,
admin-editable copy — edit either directly or from `/admin` → Begivenhed.
Once Supabase is connected, the timeline, practical info cards, event info,
and venue location can all be edited from `/admin` instead of by editing
code.

## Weather section

Uses [Open-Meteo](https://open-meteo.com) (no API key needed). More than
~10 days before 1 May 2027 it shows a real historical average for that
date (last 8 years) rather than a fabricated forecast; within ~10 days it
switches to Open-Meteo's actual forecast. To swap providers later, edit
`src/lib/weather/` — the rest of the app only calls `getWeatherOutlook()`.

## Deploying to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket.
2. Import it in Vercel — it auto-detects Vite (`npm run build`, output
   `dist/`) and auto-detects the `/api/*.ts` files as serverless functions;
   no extra configuration is needed for either.
3. Add every variable from the table above as an Environment Variable in
   the Vercel project settings (Production + Preview) — the `SUPABASE_`,
   `RESEND_`, and `EMAIL_FROM` ones are server-only and safe there; Vercel
   never sends non-`VITE_`-prefixed variables to the browser.
4. If your Supabase Auth is restricted by allowed redirect URLs, add your
   Vercel domain in Supabase → Authentication → URL Configuration.

`vercel.json` includes an SPA rewrite so `/admin` (and any deep link)
resolves correctly on refresh; it doesn't need to (and shouldn't) rewrite
`/api/*`, since Vercel routes those to the serverless functions directly.

## Project structure

```
src/
  components/   Reusable UI (Button, Card, Navigation, Reveal, forms, ...)
  sections/     One file per homepage section (Hero, Invitation, Dagen, ...)
  pages/        Route-level composition (HomePage, admin/*)
  hooks/        useVideoScrub, useSiteSetting, useAdminSession, ...
  lib/          Supabase client, api/* data-access layer, weather/*, utils
  data/         Editable fallback content (event info, timeline, ...)
  types/        Shared TypeScript types
supabase/
  migrations/   SQL schema, RLS policies, storage bucket, seed data
api/
  send-confirmation.ts   POST { email } — sends the confirmation email
  calendar-invite.ts     GET ?email=... — serves the .ics for download
  _lib/                  Server-only helpers (Supabase admin client, ICS
                         builder, email template, Resend client) — never
                         imported from src/
```

## Scripts

```bash
npm run dev       # start dev server (also serves /api locally)
npm run build     # type-check (app + api) + production build to dist/
npm run preview   # preview the production build locally (static only — /api needs `npm run dev` or Vercel)
npm run lint      # oxlint
```
