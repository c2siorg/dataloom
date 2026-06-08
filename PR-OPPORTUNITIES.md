# DataLoom — PR Opportunities

> Verified against `upstream/main` @ `2886f81` on 2026-06-08 (after fast-forwarding local `main`, was 48 commits behind).
> Excludes reserved **GSoC #76** scope (multi-format upload/export, profiling, column-selector refactor, merge/join, formula columns + pipelines, visualization, data-quality engine) and any issue with an already-open PR.

## Legend
- **Effort**: S = <30 min · M = a few hours · L = day+
- **Type**: bug / cleanup / feature / refactor / test / docs

---

## Tier 1 — Ready now (clean, confirmed-open, near-certain merges)

### #259 — `change_cell_value` missing lower-bound check on `col_index`
- **Type**: bug · **Effort**: S
- **Status**: VALID — `transformation_service.py:227` checks only `row_index >= len(df) or col_index >= len(df.columns) + 1`; no guard for `col_index < 1` or `row_index < 0`. A negative index silently wraps to the wrong column/row.
- **Fix**: add lower-bound validation (`col_index < 1`, `row_index < 0`) raising `TransformationError`; mirror the pattern already in `rename_column` (`:329`).
- **Files**: `dataloom-backend/app/services/transformation_service.py`
- **Tests**: add negative-index cases to `tests/test_transformations.py`.

### #263 — `get_project_by_id` is dead code
- **Type**: cleanup · **Effort**: S
- **Status**: VALID — defined at `project_service.py:42`, zero callers across the backend.
- **Fix**: delete the function (and any now-unused imports).
- **Files**: `dataloom-backend/app/services/project_service.py`

### #261 — `validate_row_index` / `validate_column_index` are dead code
- **Type**: cleanup · **Effort**: S
- **Status**: VALID — defined at `pandas_helpers.py:100` and `:117`, zero callers.
- **Fix**: delete both functions (and unused imports).
- **Files**: `dataloom-backend/app/utils/pandas_helpers.py`

> **Suggested PR A:** bundle #259 + #263 + #261 into one "backend hardening + dead-code removal" PR. Fast, mechanical, high merge odds.

---

## Tier 2 — Worthwhile standalone PRs

### #88 — Show all checkpoints (not just the last)
- **Type**: feature · **Effort**: M
- **Status**: VALID — `GET /logs/checkpoints/{project_id}` still returns only `get_last_checkpoint` (single `CheckpointResponse`); `CheckpointsPanel.jsx` still renders one object (`checkpoints.id`, `checkpoints.message`).
- **Fix**: backend — return a list of all checkpoints (new/updated response model); frontend — render a table/list and wire revert per row.
- **Files**: `dataloom-backend/app/api/endpoints/user_logs.py`, `app/schemas.py`, `dataloom-frontend/src/Components/history/CheckpointsPanel.jsx`, `src/api/logs.js`
- **Note**: most user-visible of the remaining set; pairs naturally with the existing revert-to-checkpoint flow.

### #128 — `MenuNavbar` maintenance / refactor
- **Type**: refactor · **Effort**: M
- **Status**: VALID — both `MenuNavbar.jsx` and `Navbar.jsx` still exist; overlapping/legacy navbar code.
- **Fix**: consolidate the two navbars, remove dead props/handlers, align with current routing/auth.
- **Files**: `dataloom-frontend/src/Components/MenuNavbar.jsx`, `src/Components/Navbar.jsx`
- **Note**: confirm which navbar is actually mounted before deleting; coordinate since it touches shared layout.

---

## Tier 3 — Small slivers (only partly open; low value, optional)

### #250 — Project cards: metadata, quick actions, rename
- **Type**: feature · **Effort**: M
- **Status**: PARTIAL — empty state landed (#248 fixed); card **rename** and richer metadata/quick-actions still missing.
- **Scope a PR around**: rename action + last-modified/row-count metadata on cards only.
- **Files**: `dataloom-frontend/src/Components/Homescreen.jsx`

### #94 — Loading skeletons
- **Type**: feature · **Effort**: M
- **Status**: PARTIAL — empty state exists; loading **skeleton** placeholders still missing during fetch.
- **Files**: `dataloom-frontend/src/Components/Homescreen.jsx`, `src/Components/DataScreen.jsx`

### #84 / #83 / #100 — More component/screen tests
- **Type**: test · **Effort**: M each
- **Status**: PARTIAL — real coverage now exists (`Table.columnOrder`, `ContextMenu`, `TransformResultPreview`, `Modal`, `Button`…). Only gaps remain.
- **Scope a PR around**: a specific uncovered component rather than the whole issue.
- **Note**: natural extension of the Playwright E2E work on the current branch.

---

## Closed by recent upstream work — DO NOT work on (propose closing instead)

| Issue | Resolved by |
|---|---|
| #49 revert clears unapplied logs | revert endpoint now clears them (`projects.py:228–230`) |
| #199 dropNa None crash | `(drop_na_params or {})` guard |
| #257 context-menu add/delete columns | merged PR #302 |
| #224 repeated saves drop transforms | save reads working copy directly |
| #78 Not Equal/Contains filters | already in `FilterForm.jsx` + backend |
| #79 alert()/prompt() removal | zero usages remain |
| #77 alert-vs-toast handling | zero `alert(` usages remain |
| #248 empty state for Projects | `EmptyState` in `Homescreen.jsx:67` |
| #191 transform status codes | proper 400/404/500 handling added |
| #168 logs 404 | uses `get_project_or_404` |
| #195 hardcoded CORS | configurable via `settings.cors_origins` |
| #148 non-CSV upload API call | merged PR #317 |
| #220 null vs empty-string | merged PR #329 |
| #146 Create-Project ESC | `Modal.jsx:17` handles Escape |

---

## Reserved — GSoC #76 scope, OFF-LIMITS

#290, #246, #65 (profiling/stats) · #332, #92 (multi-format export) · #34 (pipeline builder) · #334 (multi-format docs)

## Already has an open PR — skip to avoid collision

#327 (PRs #348/#328) · #346 (#347) · #342 (#345) · #339 (#343) · #252 (#280) · #251/#210 (#279)
