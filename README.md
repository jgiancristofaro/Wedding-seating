# Seating Plan — a visual wedding seating chart

Import guests, lay out the room, drag guests to seats (or let auto-seat do it), and share one link with family.
No accounts. Runs on GitHub Pages; optional free Supabase backend for cloud saves and live sharing.

**Live:** https://jgiancristofaro.github.io/Wedding-seating/ (after the checklist below)

## ✅ Manual steps (one-time, ~10 minutes)

1. **GitHub Pages:** repo → _Settings → Pages → Build and deployment → Source: **GitHub Actions**_.
2. **Create a Supabase project** (free): https://supabase.com → _New project_. Wait for it to finish provisioning.
3. **Create the database:** Supabase → _SQL Editor → New query_ → paste all of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → _Run_.
4. **Copy the public keys:** Supabase → _Project Settings → API_: copy the **Project URL** and the **anon / publishable**
   key. ⚠️ Never use the `service_role` / secret key.
5. **Add GitHub secrets:** repo → _Settings → Secrets and variables → Actions → New repository secret_:
   `VITE_SUPABASE_URL` = Project URL, `VITE_SUPABASE_ANON_KEY` = anon key.
6. **Deploy:** repo → _Actions → CI & deploy → Run workflow_ (or push to `main`). The URL appears on the run.

Skip steps 2–5 and the app still works in **local mode**: plans are saved in that browser only (share links won't
work on other devices; use JSON backups to move a plan).

## Local development

```bash
npm start            # installs dependencies and starts http://localhost:5173 (local mode)
```

To develop against Supabase, copy `.env.example` to `.env.local` and fill in the two public values.

| Command            | What it does                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| `npm run dev`      | Vite dev server                                                                                       |
| `npm run build`    | type-check + production build to `dist/`                                                              |
| `npm test`         | unit tests (CSV parsing/mapping, conflicts, optimizer, merge, wall detection)                         |
| `npm run test:sql` | runs the migration + access-policy tests on a throwaway local Postgres (needs `postgresql` installed) |
| `npm run test:e2e` | Playwright smoke tests on desktop and a 375 px phone (builds in local mode)                           |
| `npm run check`    | typecheck + lint + format check + unit tests                                                          |

## How it works

- **Guests:** CSV drag-drop/file picker, paste from Excel/Sheets, or add by hand. Columns are auto-detected (name or
  first/last, party size/plus-ones, household, group/side, dietary, accessibility, RSVP, notes, table). Preview shows
  new / changed / duplicate / invalid rows; re-imports merge by name and let you pick which value wins. A sample CSV
  template is downloadable. Households and plus-ones are linked and move together.
- **Layout:** round, oval, banquet, square, head and sweetheart tables; venue items (dance floor, stage, bar, buffet,
  DJ, photo booth, entrance, cake, gifts, labels); walls, doors, windows with snapping. Upload a JPG/PNG/PDF floor
  plan, set the scale with two clicks, let **wall suggestions** trace it, then tidy up by hand. Toggle image / traced /
  both. **3D preview** (read-only, works on phones).
- **Seating:** drag guests (or whole households) onto a seat or a table; tap-a-guest-then-tap-a-seat; or use the
  keyboard (Enter to pick up, Tab to a table, arrows between seats, Enter to drop). Rules (_must / must not sit
  together_, same table or nearby), live conflict badges and a Conflicts panel. **Auto-seat** runs in a background
  worker, shows a preview + score + what couldn't be satisfied, and only applies when you accept. Lock guests or
  tables to protect them.
- **Export:** PDF (overview, page per table, alphabetical _find your seat_; Letter/A4/Legal/Tabloid/A3), PNG/SVG,
  CSV/XLSX (guest list + per-table roster), place cards, table numbers, JSON backup/restore, share links + QR code.
- **Saving:** autosave (~1 s debounce) with _Saved / Saving / Offline_ status; edits made offline are kept on the
  device and synced later; concurrent edits merge automatically; undo/redo (50 steps); version history (last 30,
  restorable); recent plans remembered on the start page.

## Backups

_Export → Backup → Download backup (.json)_ saves everything except the floor plan photo. Restore it with
_Export → Restore from backup_ (replaces the current plan, undoable) or _Start page → Restore from a JSON backup_
(creates a new plan with new links).

## Threat model (short)

- **Who can do what:** anyone with the **edit link** can read and change the plan; anyone with the **view link** can
  read it. Links are 192-bit random tokens — unguessable, but they are bearer secrets: anyone you forward them to has
  that access. There are no user accounts.
- **Enforced in the database:** tables have RLS enabled with no policies and privileges revoked, so the public anon
  key cannot touch rows directly. Every read/write goes through `SECURITY DEFINER` functions that hash the presented
  token and compare it with the stored hash (edit tokens are stored only as SHA-256). Writes require the edit token.
  Unknown tokens get "not found" without revealing whether a plan exists. `npm run test:sql` verifies this.
- **Limits:** documents ≤ 3 MB, images ≤ 4 MB (JPEG/PNG/WebP only), 30 snapshots and 3 images per plan.
- **Not covered (known):** links can't be revoked or rotated yet; no rate limiting beyond Supabase's defaults (a
  malicious actor could create many plans); realtime "updated" pings are unauthenticated but only trigger a re-fetch
  through the token-checked RPC; content is not end-to-end encrypted (Supabase can read it). Only the anon key ships
  in the bundle — the deploy workflow fails if a `service_role` key appears.

More: [docs/PLAN.md](docs/PLAN.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DECISIONS.md](docs/DECISIONS.md)
