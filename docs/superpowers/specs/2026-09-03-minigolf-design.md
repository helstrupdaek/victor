# Minigolf minigame — design

## Purpose

A single-hole, browser-playable 3D minigolf minigame at `/minigolf`, themed
loosely on the house where the party takes place, so guests have something
fun to come back to during the long wait between RSVPing and the actual
confirmation (1 May 2027). Scores feed a leaderboard; the winner gets
announced at the party.

## Scope

- **One hole**, simple and stylized — not a realistic model of the house.
  Built from basic geometric shapes (boxes, a plane, a cylinder or two),
  not an imported 3D model. More holes can follow later if this is a hit.
- Playable on desktop and mobile browsers via the existing site.

## Tech stack

- **React Three Fiber** (React bindings for Three.js) + **@react-three/rapier**
  for physics (ball rolling, slopes, wall/obstacle collisions). Rapier's WASM
  physics handles this more robustly than lighter pure-JS physics libraries,
  which are prone to jitter/tunneling at higher ball speeds.
- The game bundle (Three.js + Rapier, ~1–2MB) is **lazy-loaded** only on the
  `/minigolf` route (`React.lazy` + dynamic import), so it has zero effect on
  the load time of every other page.

## Gameplay

- **Course**: inspired by the house photo without trying to be accurate — tee
  near the road/driveway, a bend around a blocky stand-in for the house, cup
  somewhere in the garden, one simple obstacle (e.g. a cylinder "tree") to
  bank around.
- **Boundaries**: invisible walls around the entire play area so an errant
  shot bounces back rather than needing out-of-bounds handling.
- **Controls**: click-and-drag from the ball — drag direction sets aim
  (opposite the drag), drag distance sets power, release to shoot. Identical
  behavior for mouse and touch.
- **Camera**: fixed, angled overhead view showing the whole hole at once. No
  camera-follow logic.
- **Timing**: stopwatch starts on the first shot (not on page load) and stops
  the instant the ball sinks. Shot count increments per swing.

## Scoring

- `score = shots × 10 + seconds` (lower is better) — computed **server-side**
  from raw `shots`/`seconds`, never trusted from the client.
- Unlimited retries. Only a guest's best score is kept; a worse retry never
  overwrites a better one. "Retry" means a fresh attempt: ball back at the
  tee, shot count and timer both reset to zero — each attempt's totals are
  independent, only the completed attempt gets submitted/compared.

## Player identity

- To submit a score, a player enters the email they used to RSVP. The API
  validates it against the real `guests` table — anyone without a matching
  RSVP is rejected with a friendly message.
- The email is remembered in `localStorage` after first entry so repeat
  visits don't re-ask (same pattern as the `/wish` PIN).
- **Display name on the leaderboard is the email's local-part** (the part
  before `@`) — e.g. `cdelmoth` for `cdelmoth@gmail.com`. Full emails are
  never sent to the client or shown publicly.

## Data model

New table `minigolf_scores` (one row per guest, keyed by email):

```sql
create table public.minigolf_scores (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  guest_email text not null unique,
  shots int not null,
  seconds numeric not null,
  score numeric not null
);

alter table public.minigolf_scores enable row level security;

-- No policies for anon at all: the public leaderboard is served through
-- the API route (service-role), never a direct anon query, so there is no
-- anon RLS surface on this table to get wrong.

create policy "minigolf_admin_all" on public.minigolf_scores
  for all to authenticated
  using (true)
  with check (true);
```

## API routes (service-role, same pattern as existing `/api` routes)

- **`POST /api/minigolf/submit-score { email, shots, seconds }`**
  1. Normalize email (trim + lowercase), look it up in `guests` — 404/friendly
     error if no matching RSVP.
  2. Sanity-bound the inputs (shots: 1–50 integer, seconds: 0.1–3600) —
     reject nonsense values. This is proportionate abuse-prevention, not
     real anti-cheat (verifying a physics replay server-side is out of
     scope — this is a friendly party leaderboard, not a competitive
     esport).
  3. Compute `score` server-side from the validated `shots`/`seconds`.
  4. Look up the guest's existing best score; only upsert if the new score
     is better (or no row exists yet).
- **`GET /api/minigolf/leaderboard`** — returns the top N scores (e.g. 20),
  each with `display_name` (derived local-part, computed server-side),
  `shots`, `seconds`, `score`. Never returns full email addresses.

## Admin

A new **Minigolf** tab in the existing admin dashboard (same pattern as the
RSVP/Wishlist tabs), listing every score with edit and delete controls, using
the existing authenticated Supabase Auth session — for correcting or removing
an obviously-cheated entry.

## Frontend

- New route `/minigolf`, linked from the main nav.
- Landing state: brief instructions + "Spil" button that lazy-loads the 3D
  scene.
- First play asks for the RSVP email once; remembered thereafter via
  `localStorage`.
- On sinking the hole: result panel (shots, time, score) with "Gem score"
  (submit) and "Prøv igen" (retry) actions.
- A leaderboard section below the game, visible at all times, refreshing
  after a successful submit.

## Error handling & edge cases

- Non-guest email → rejected with a message pointing them to RSVP first.
- Out-of-range shots/seconds → rejected server-side.
- Ball leaving the intended play area → bounced back by invisible boundary
  walls; no out-of-bounds scoring logic needed.
- 3D scene fails to load (e.g. WebGL unsupported) → friendly fallback
  message rather than a blank page.

## Testing plan

- Shot mechanic across a range of angles/power: no tunneling through walls,
  no getting stuck on slopes.
- End-to-end: non-guest email rejected, real guest accepted, score submitted
  and appears correctly on the leaderboard with the right display name and
  computed score.
- Retry logic: a worse retry never overwrites a better saved score.
- Touch controls on a mobile viewport.
- Admin edit/delete tab reflects correctly on the public leaderboard.
- Confirm `/minigolf`'s heavy bundle is excluded from every other page's
  bundle (lazy-loading actually works).
