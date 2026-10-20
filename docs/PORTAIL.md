# SETRAM — Plateforme Maintenance

One React/TS app hosting all of SETRAM's maintenance tooling: the public
Home/Ingénierie/Documents portal plus the authenticated Planification (OPPI)
module. Built by consolidating what used to be four separately-built pieces
(`project_setram/plannification`, and the static HTML tools under
`project_setram/APPLI_pieces-jointes`) into one app, one design system, one
deploy.

## Running locally

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build (tsc -b && vite build)
npm run lint
```

Planification's Supabase/API env vars still apply as before (see `.env` /
the host's environment settings) — nothing about its auth or data layer changed.

## Routing

| Path | What it is | Auth |
|---|---|---|
| `/` | Home — hero + module cards | Public |
| `/ingenierie/*` | Ingénierie tools | Public |
| `/documents/*` | Documents & validation | Public |
| `/planification/*` | OPPI (planning, congés, clôture, etc.) | **Supabase-gated**, same as before |
| `/login` | Planification's login | Public |

Home/Ingénierie/Documents are public because the tools they replace were
static files with no login — that access model was preserved deliberately,
not an oversight. Planification kept its existing `ProtectedRoute`/Supabase
auth exactly as it was; only its URL prefix moved from `/` to `/planification`
(see `src/App.tsx`, `src/components/Sidebar.tsx`, and the handful of
`navigate()`/`<Navigate>` call sites that referenced absolute paths). After
login, `Login.tsx` sends the user back to `/` (Home) by default, not straight
into Planification — Home is the flagship entry point.

## Local dev: two servers

Vite (`npm run dev`) only serves the frontend. Planification's `/api/*` calls
go through Vite's dev proxy to a **separate Express server that you must also
run**:

```bash
node api/server.js   # http://localhost:3000 — run this alongside `npm run dev`
```

Without it, anything that calls `/api/profiles` etc. (including the
post-login profile fetch) fails with a 500/connection-refused. This isn't
new to this pass — `api/server.js` predates it — just easy to forget.

## Home hero — one pinned scene, cards at the side

`src/components/hero/HeroSequence.tsx`: the tram decomposes center-frame in
a pinned, scroll-scrubbed video (`h-[300vh]`), while the three application
cards reveal down the **right edge**, staggered by scroll position. The
center of the frame, where the tram is, is never covered.

Smoothing went through three iterations worth knowing about, because the
failure mode at each step looked different and it's easy to reintroduce one
of these by "fixing" the wrong layer:
- **v1** wrote `scrollYProgress` straight to `video.currentTime` on every
  scroll event — stuttery, since video decoders choke on being seeked every
  raw wheel tick.
- **v2** added Lenis (page-level scroll smoothing — confirmed by inspecting
  trionn.com directly, which uses the same library) *and* wrapped
  `scrollYProgress` in `useSpring`, plus throttled the writes. This
  double-smoothed: while the spring was still settling after a flick, most
  of its per-frame movement fell under the throttle threshold and got
  skipped (looked "stuck"), until enough accumulated to cross the threshold
  in one jump (looked like it skipped to the end).
- **v3** (this) dropped the spring/throttle, kept Lenis alone — fixed the
  stutter, but **broke scrolling outright** for some real users ("video
  doesn't move, stuck"), while automated `scrollTo()`-based tests kept
  reporting it as working. That mismatch was the tell: Lenis only reacts to
  genuine wheel/touch input, so those tests were never exercising the code
  path a real user hits, and Lenis's React lifecycle (create/destroy across
  StrictMode's double-invoke, or on remounting when navigating back to
  Home) is exactly the kind of thing that can silently leave scroll not
  moving at all.
- **Current**: no Lenis, no library touches the scrollbar — scrolling is
  100% native the entire time, which the browser guarantees can't get
  "stuck". Smoothing now happens independently in a plain
  `requestAnimationFrame` loop inside `HeroSequence` itself: each frame, a
  local value lerps toward the real scroll progress
  (`smoothed += (target - smoothed) * 0.12`), and `video.currentTime` is
  set from that. If this loop has a bug, worst case the video lags a frame
  behind — it can never take scrolling down with it, because it never
  controls scrolling in the first place. Verified with real wheel-scroll
  gestures in both directions across multiple consecutive scrolls (not
  `window.scrollTo()` — see above for why that doesn't prove anything here).

There is no `useSmoothScroll`/Lenis anywhere in this app anymore (removed
the `lenis` package too). If a future direction wants page-wide inertia
scrolling, know going in that it needs the same real-input testing
discipline above, not just an automated scrollTo() check.

## Navigation

`TopNav` (`src/components/shell/TopNav.tsx`) — Ingénierie and Documents are
dropdown menus (hover or focus to open), listing every tool in that
section, so you can jump directly from one tool to another without
returning to the section's index page first. There's no separate sub-nav
bar anymore (an earlier version had one; folded into the dropdowns instead,
per direct feedback that a second nav bar was unnecessary).

## Design system — where to change things

- **Colors, fonts**: `src/index.css`, inside the `@theme` block. Tailwind v4
  auto-generates utility classes from these (`bg-steel`, `text-ink-muted`,
  `font-display`, etc.) — don't hardcode hex values in components, add a
  token here instead.
- **Shared UI components**: `src/components/ui/` — `Button`, `Card`/`KpiCard`,
  `StatusBadge`, `DataTable`, `Modal`, `FilterBar`, `Dropzone`, `StatTile`,
  `SectionHeader`. These are the canonical versions of patterns that used to
  be copy-pasted across every legacy HTML file.
- **Shared shell**: `src/components/shell/` — `TopNav` (the persistent header
  with the three section links), `PortailLayout` (wraps a page with TopNav),
  `PageTransition` (the "coupling" motion used for route transitions).
- **Hero**: `src/components/hero/TramVideoHero.tsx` — the signature motif. The
  actual tram decompose/recompose video (`public/hero/tram-assembly.mp4`, a
  copy of `project_setram/je_veut_creer_un_site_web_D_p.mp4`), scroll-scrubbed:
  `video.currentTime` is bound to scroll progress via Framer Motion's
  `useScroll`/`useMotionValueEvent`, so scrolling down plays the decompose
  forward and scrolling up reverses it — for free, since it's just seeking to
  a time position, not two separate clips. `prefers-reduced-motion` disables
  the scroll-pin entirely and shows the video paused on frame 0, like a still
  image.

### Adding a nav item

Edit `SECTIONS` in `src/components/shell/TopNav.tsx`. For a fourth module,
add a route in `src/App.tsx` following the `/ingenierie/*` or `/documents/*`
pattern (its own `*Routes.tsx` wrapping a `PortailLayout`).

### Adding a page inside Ingénierie or Documents

Add a route to `IngenierieRoutes.tsx` / `DocumentsRoutes.tsx` and a card to
`IngenierieHome.tsx` / `DocumentsHome.tsx`.

## What's real vs. what's a bridge to legacy code

**Fully ported to React** (behavior preserved, not just re-skinned):
- Home, the shared shell/nav, and all shared UI components
- Ingénierie → **Centre d'Import** (`src/pages/portail/ingenierie/CentreImport.tsx`).
  The shared IndexedDB import hub it reads/writes (`src/lib/importHub.ts`) is
  byte-for-byte schema-compatible with the legacy tools below — do not
  rename the db/store names or change the record shape without updating
  both sides.

**Not yet ported — still the original HTML/CSS/JS, but now all navigable
in-app via `<iframe>` (none open a new tab anymore) and reskinned to the new
design tokens (colors + Inter, applied as CSS-variable value swaps only —
no structural changes):**
- `public/legacy/departements/ingenierie/analyse-mbf.html` — its own
  dropzone UI removed; it now reads exclusively from the Centre d'Import
  hub and shows a "go import" callout when the hub is empty
- `public/legacy/departements/ingenierie/analyse-ram.html` — same
  dropzone-removal treatment; its 10-tab horizontal nav (which overflowed
  and scrolled sideways) was converted to a vertical sidebar (`.tab-sidebar`
  / `.main-col` in the file), same pattern as the Documents registry page.
  Only the CSS/markup wrapper changed — the tab-switching JS still queries
  `nav.tabs button` exactly as before, untouched. Also removed a duplicate
  logo/branding row and an off-palette rainbow accent bar that clashed with
  the rest of the site.
- `public/legacy/departements/ingenierie/analyse-rapport-journalier.html` —
  **left with its own file picker on purpose**: unlike the others, this tool
  compares different daily PDF reports each session (not a stable shared
  import), so routing it through Centre d'Import would be the wrong fit
- `public/legacy/departements/ingenierie/suivi-performances.html` (9,900
  lines — by far the largest, likely contains the most calculation logic
  worth extracting into `src/lib/` alongside Analyse MBF when it's ported).
  **Its own import UI was intentionally left untouched** — it has multiple
  drop zones across several tabs (Corrective/Préventif, Matériel Roulant, RH
  ×2) and at least one pre-existing duplicate-`id` bug; simplifying it safely
  needs a real read-through, not a rushed edit.
- `public/legacy/departements/ingenierie/validation-rapports.html` — now
  iframed at `/documents/validation` instead of opening a new tab, per
  explicit request. It uses the File System Access API (`showDirectoryPicker`),
  which needs a user gesture — same-origin iframes generally support this,
  and it rendered fine in testing, but do a hands-on check of the actual
  folder-connect flow before relying on it in production.
- `public/legacy/departements/maintenance/suivi-documents.html` — now
  iframed at `/documents/registre`. It keeps its own internal sidebar
  (functionally important, not just decorative) alongside the app's TopNav —
  a deliberate compromise, not an oversight.
- `public/legacy/suivi_modifications.html` — now at `/documents/modifications`
  ("Demandes de modification"). It was a dark-themed page (not just
  differently-colored, an actual dark UI); converted to the light design
  system by remapping all ~20 of its hardcoded hex colors — worth a visual
  once-over since this was the biggest single reskin in the pass.

Porting the three untouched-logic Ingénierie tools (`analyse-mbf`,
`analyse-ram`, `suivi-performances`) is the largest remaining chunk of work —
they total roughly 14,000 lines combined and contain the real
GMAO/MTBF/Pareto/AMDEC calculation logic. Rushing them risked exactly what
this project was told not to do (silently change business logic), so they
were deliberately left as working legacy bridges rather than rushed. Same
"preserve behavior, then de-duplicate" approach used for Centre d'Import
should apply — check `suivi-performances.html` and `analyse-mbf.html` for
duplicated KPI/MTBF math before porting either.

## Known shortcuts / things a future maintainer should know

- **`APPLI_pieces-jointes` (the original static portal) has not been
  deleted.** It's superseded by this app but left in place at
  `project_setram/APPLI_pieces-jointes` since deleting source files someone
  else built isn't a call to make silently — confirm it's safe to remove,
  then delete it and this note.
- **Legacy iframe pages show two header bars** (this app's `TopNav` + the
  legacy tool's own internal header) — a known visual seam, not a bug. Goes
  away as each tool gets ported.
- **Font is Inter-only across the legacy pages** — the original Phase 1 plan
  called for a distinct Space Grotesk display face too, but splitting
  display-vs-body font usage safely across ~14,000 lines of legacy markup
  without misreading which headings are "display" vs "body" was too risky to
  rush. Inter unifies them safely; the full type system (Space Grotesk +
  Inter + IBM Plex Mono) only really lives in the new React pages for now.
  Apply it properly once each tool is ported.
- **Lighthouse/perf pass not yet run** — the 90+ performance target from the
  brief hasn't been measured yet on this build. Do this before shipping;
  the `suivi-performances.html` legacy iframe (large DOM, likely large
  tables) is the most likely place to miss the target — virtualizing its
  tables with `react-window` during its eventual port is already flagged
  above. The video hero itself (2.8MB, 1280×720, scroll-scrubbed rather than
  autoplaying/looping) should be light, but hasn't been measured either.
- **Browser/device target for SETRAM office machines was never confirmed** —
  built and tested against a modern Chromium baseline. If staff are on an
  older browser, revisit before shipping.
- **No cross-browser/mobile QA pass done yet** on the new Home/Ingénierie/
  Documents pages — only desktop-width manual checks so far.
