# Plan

## Architecture (one page)

```
 Browser (static, GitHub Pages)                         Supabase (free tier)
 ┌──────────────────────────────────────────────┐       ┌──────────────────────────────┐
 │ React UI (Guests · Layout · Seating · Export)│       │ Postgres                      │
 │   │                                          │       │  plans / plan_snapshots /     │
 │ planStore (zustand + immer patches, undo 50) │       │  plan_assets  (RLS: deny all) │
 │   │                                          │  RPC  │                              │
 │ SyncEngine (debounce, retry, 3-way merge) ───┼──────▶│  SECURITY DEFINER functions   │
 │   │   ▲ local draft (IndexedDB)              │       │  keyed on sha256(token)       │
 │   │   └ Realtime broadcast "version bumped" ◀┼───────│  Realtime broadcast channel   │
 │ Workers: optimizer · line detection          │       └──────────────────────────────┘
 │ Lazy chunks: three.js · pdf.js · jsPDF · xlsx│
 └──────────────────────────────────────────────┘
```

- Single JSON **plan document** (guests, groups, tables, rules, floor elements, backdrop, settings) is the unit
  of persistence. Simple, merges cleanly per entity, ~150 KB for 500 guests.
- Backend is reached only through a `Backend` interface; `SupabaseBackend` for the cloud, `LocalBackend`
  (IndexedDB) when no env vars are configured — the app is fully usable without any account.

## Data model

`PlanDoc { schemaVersion, name, eventDate, units, guests{}, groups{}, tables{}, rules{}, elements{}, backdrop, settings }`

- `Guest { id, firstName, lastName, groupId, partyId, rsvp, dietary[], access[], notes, tableId, seat, locked }`
- `Table { id, name, shape, x, y, w, h, rotation, capacity, locked }` (world units = cm)
- `Rule { id, kind: together|apart, scope: table|nearby, a, b }`
- `FloorElement { id, kind, x, y, w, h, rotation, x2?, y2?, label? }` (walls/doors/windows are segments)
- `Backdrop { assetId, natW, natH, x, y, cmPerPx, opacity, visible }`

## Schema & security

- `plans(id, edit_token_hash, view_token_hash, view_token, doc jsonb, version, …)`
- `plan_snapshots(plan_id, version, doc, label, created_at)` – auto every 10 min of editing + manual; keep 30.
- `plan_assets(plan_id, mime, data bytea)` – floor plan images ≤ 4 MB after client downscale.
- RLS enabled with **no policies** and table privileges revoked from `anon`; all access via
  `SECURITY DEFINER` RPCs that hash the presented token and compare: `create_plan`, `get_plan`,
  `save_plan` (optimistic concurrency on `version`), `create_snapshot`, `list_snapshots`, `get_snapshot`,
  `put_asset`, `get_asset`. Edit token required for every write.

## Milestones

1. Schema + policies + SQL tests → 2. model/store/undo → 3. CSV import & mapping → 4. SVG canvas + drag/drop →
   5. rules/conflicts → 6. persistence/sharing/realtime/history → 7. backdrop + calibration →
   8. vector tools + assisted tracing → 9. 3D preview → 10. optimizer → 11. exports → 12. polish/a11y →
   13. unit + e2e tests → 14. CI + Pages deploy.
