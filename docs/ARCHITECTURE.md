# Architecture

```
src/
  model/        types, factories, seat geometry, pure seat ops, selectors, demo dataset
  store/        planStore (doc + immer-patch undo/redo), uiStore (viewport/selection), actions (user commands)
  persistence/  Backend interface → supabaseBackend | localBackend, SyncEngine (autosave, retry, merge),
                merge3, drafts (IndexedDB offline copy), recent plans, session (open/create)
  import/       CSV decode/parse, column auto-mapping, candidates → review → merge
  rules/        conflict detection (capacity, together/apart, nearby, split households, declined-but-seated)
  optimizer/    constraint construction + simulated annealing (pure) + Web Worker wrapper
  floorplan/    image/PDF loading + downscale, wall detection (pure) + worker
  export/       standalone SVG renderer, PNG, PDF (chart, tables, find-your-seat, cards), CSV/XLSX, JSON
  features/     React UI: shell, guests, canvas, seating, layout, three (3D), export, rules
  pages/        Home, PlanPage, NotFound
supabase/       migrations/0001_init.sql (schema + RPCs), test/ (policy tests against throwaway Postgres)
e2e/            Playwright smoke tests (desktop + 375 px phone)
```

**Data flow.** UI → `actions.ts` → `commit()` produces a new immutable `PlanDoc` with patches (undo) →
`SyncEngine` sees the change, writes an IndexedDB draft, debounces 0.9 s, calls `save_plan(token, doc, version)`.
Conflict → fetch current → `merge3(base, mine, theirs)` → retry. Network error → "Offline", exponential backoff
(2–30 s) and retry on `online`. After a save, a Realtime broadcast nudges other tabs/devices, which pull and merge.

**Rendering.** `Canvas` is one SVG with a viewport transform; `TableNode`/`ElementNode` are memoised and receive a
bucketed zoom (level of detail) so pan doesn't re-render them. Drags keep transient overrides in local state and
commit once on pointer-up. Heavy code (three.js, pdf.js, jsPDF, XLSX, optimizer, detector) is code-split.

**Security model.** See README → Threat model.
