# Decisions

Ambiguities resolved during the build, newest last. Each entry: decision — reason.

1. **Backend: Supabase (Postgres + RPC + Realtime broadcast).** Free tier, anon key is designed to be public, row-level
   security plus `SECURITY DEFINER` functions let us enforce token access in the database. Alternatives considered:
   Firebase (rules can't easily hash/compare secret tokens without custom auth), Cloudflare Workers + KV (needs a
   deployed worker and secrets management — more moving parts for a non-technical owner), PocketBase (needs a server).
2. **All data access goes through RPCs; tables are deny-all.** Simpler and safer than RLS policies that read a token
   from request headers. Tokens are 192-bit random, only SHA-256 of the edit token is stored. The view token is also
   stored in plaintext so editors can re-display the share link on another device (it only grants read access).
3. **One JSON document per plan** (not normalised tables). A wedding is ≤ ~1,000 entities; a single document keeps
   saves atomic, makes snapshots trivial, and allows an entity-level 3-way merge on conflicts.
4. **Conflict handling = optimistic concurrency + automatic 3-way merge** ("my change wins per field, otherwise take
   theirs"). Seat collisions after a merge unseat the later guest and show a toast. Realtime is used only as a
   "version bumped" nudge; data is always re-fetched through the token-checked RPC so a forged broadcast is harmless.
5. **Local-only mode when env vars are missing.** The same `Backend` interface is implemented over IndexedDB. The app
   works out of the box (and e2e tests run without any account); the Share panel explains links are browser-local.
6. **Floor plan image stored as `bytea` in Postgres (≤ 4 MB after client downscale to 2400 px JPEG)** rather than
   Supabase Storage — keeps access control in one place (same token RPCs) with no bucket policies to configure.
   Three most recent images per plan are kept so restored snapshots still find their image.
7. **Canvas: SVG with pointer events (no Konva).** 500 seats ≈ 2–3k SVG nodes, which is fine; SVG gives native
   accessibility (focusable tables/seats, ARIA labels), crisp zoom, trivial SVG export and simple `elementFromPoint`
   hit-testing for drag-and-drop across HTML ↔ SVG. Table nodes are memoised; drags update only transient overrides.
8. **Drag & drop is custom** (pointer events + `elementFromPoint`) instead of dnd-kit, because the drop targets live
   inside a transformed SVG. Touch uses long-press (350 ms) so normal scrolling still works; tap-to-assign and
   keyboard (Enter to pick up, Tab/arrow to a seat, Enter to drop) are first-class alternatives.
9. **World units are centimetres**; UI shows feet or metres. Default table sizes are standard rental sizes.
10. **"Party size" means total people including the named guest**; a "plus-ones" column means extras. Unnamed
    plus-ones become "Guest of <name>". Re-import matches on normalised full name and never deletes.
11. **Side + group columns combine** into one group ("Bride · Family") so colours stay meaningful.
12. **Optimizer:** greedy most-constrained-first construction, then simulated annealing over unit moves and swaps
    (households are units). Hard rules weigh 1,000, an unseated guest 4,000 (leaving someone without a seat is
    worse than breaking a rule — the report says so). "Nearby" = chair rings within 1.8 m. Results are a preview
    until accepted. Scores: 40 % rules, 30 % group cohesion, 15 % balance, 15 % seated.
13. **Wall detection is a lightweight custom detector** (Otsu threshold → morphological opening to drop text →
    horizontal/vertical run bands → collinear merge), run in a Web Worker, not OpenCV.js (8 MB). It handles the
    axis-aligned plans most venues provide; diagonal walls must be traced. It is labelled "suggestions"; manual
    wall/door/window tools with corner and 15° angle snapping are the dependable path.
14. **HEIC:** decoded natively where the browser can (Safari); otherwise a friendly message. heic2any (~1 MB) was
    judged not worth the weight.
15. **PDF via jsPDF built-in fonts** (Latin-1). Non-Latin names are replaced with "?" in PDFs only (PNG/SVG/CSV keep
    them). Embedding a Unicode font would add ~300 KB+ per script; listed as a next step.
16. **Version history:** server snapshots automatically at most every 10 minutes of editing, plus "Save a version
    now" and an automatic "Before restore" snapshot; 30 kept (requirement: ≥ 20). Restores are undoable.
17. **Undo/redo:** immer patches, 50 steps; typing in one field coalesces into one step. If a collaborator's change
    makes a patch inapplicable, history is cleared instead of corrupting the document.
18. **Hash routing + relative Vite base** so the build works at any GitHub Pages sub-path with zero config.
19. **Links can't be revoked** in v1 (documented in the threat model); workaround is restore a backup into a new plan.
20. **Zola guest lists** (both the export and the upload template) import directly. Partner, "Plus One" (a name or
    "Yes"), "Additional Guest N" and "Child N First/Last Name" columns become linked household members; a partner
    named "Guest" is an unnamed plus-one; "Total Definitely Invited" is the party size; "Relationship To Couple" is
    the group (except "Unknown"); titles, suffixes, contact details and "Total Maybe Invited" are ignored. A child
    listed without a surname takes the main guest's surname.
21. **Same-name guests:** two rows with the same name but different household members are treated as different people
    (real lists have "Ron Smith" senior and junior); identical rows are still skipped as duplicates. On re-import,
    a name shared by several existing guests matches the one whose household overlaps the row. Companions of a
    skipped row are skipped with it.
