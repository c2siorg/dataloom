## Description

Once a dataset has more than 50 columns, `Table` renders only the columns in the horizontal viewport, so wide CSVs no longer put tens of thousands of cells in the DOM.

**Problem.** Rows are paginated by the backend (at most 100 per page), but every column was rendered. Each column appears in up to three header rows (profile card, name, dtype badge) and in every body row. A 300-column CSV at page size 100 put 30,000 `<td>`s, 900 `<th>`s and 300 `ColumnProfileCard`s in the DOM. Every re-render paid for all of them: opening a cell edit, changing page, toggling Column Profiles, and refreshing after a transform.

**Change.**
- New `src/hooks/useColumnWindow.ts`, which has two parts.
  - `computeColumnWindow()` is a pure function. It maps `scrollLeft`, viewport width, column count and width, the sticky S.No. width, overscan and pinned columns to `{ start, end, leftPad, rightPad }`. The spacers plus the rendered columns always add up to the full width, so the scroll width never changes. The result stays in range when the column count shrinks under a stale `scrollLeft` (after a column delete) and when the viewport has no width yet.
  - `useColumnWindow()` feeds it the scroll position. It uses a passive scroll listener throttled to one measurement per animation frame, and a `ResizeObserver` on the container, guarded because jsdom has none. The first measurement happens in a layout effect, so the first paint is already windowed. Listeners are cleaned up on unmount. A scroll that keeps the same window doesn't re-render, so scrolling within a column costs nothing.
- `Table.tsx` turns this on only above `VIRTUALIZE_COLUMN_THRESHOLD = 50` data columns. S.No. always renders. A left and a right spacer go into every header row (including the profile row) and every body row, so columns stay aligned. Spacers have no padding or border and are `aria-hidden`, so they aren't column headers.
- Indices are never re-based. Virtualization only decides which absolute indices are in the DOM, so sort, drag-reorder, the context menu, cell edits, dtype badges and profile cards all receive the same index as before.
- Some columns are pinned: the column of an in-progress cell edit and the column being dragged always render. Otherwise scrolling away would unmount the edit input (losing the edit) or the drag source (so `onDragEnd` would never fire).
- When virtualized, the table gets `aria-colcount` and each rendered cell gets `aria-colindex`.

No API, `ProjectContext`, pagination, preview-mode or `ColumnProfileCard` changes.

**Trade-offs.**
- **Fixed width above the threshold.** Windowing needs to know where each column starts, so above 50 columns every data column is `COLUMN_WIDTH = 160px`, with `table-layout: fixed` and an explicit table width (fixed layout is ignored while the table width is `auto`). Long values and header names truncate with an ellipsis, and the full text is in a `title` tooltip. 160px is wider than the profile card's existing 140px minimum, so the cards fit unchanged.
- **At or below 50 columns, nothing changes.** I verified this with a throwaway test, not committed. It rendered `main`'s `Table` and this branch's side by side and compared `innerHTML` byte for byte. It covered 1, 3 and 50 columns, profiles on and off, and with and without an open cell edit.
- **A pinned column far from the viewport extends the window.** If you open a cell edit at column 3 and scroll to column 250, everything in between renders until the edit ends. It's temporary and never more than `main` renders. Leaving a gap instead would need up to four spacers per row for a rare case.

**Why no new dependency.** I considered `@tanstack/react-virtual`. Once widths are fixed, the windowing is a few lines of arithmetic, and the library wouldn't remove the fixed-width requirement. It would still need wiring into three header rows plus the body with a sticky first column. CSS `content-visibility: auto` skips paint but keeps every node in the DOM and in React's reconciliation, which is where the cost is.

**Before / after** (local, `wide.csv`: 300 columns × 1,000 rows of mixed ints, floats, categories, dates and text; page size 100; window `<WIDTH>×<HEIGHT>`; Chrome `<VERSION>`):

| Metric | Profiles | `main` | This branch |
| --- | --- | --- | --- |
| `<td>`, data cells | off | `<TODO>` | `<TODO>` |
| `<td>`, data cells | on | `<TODO>` | `<TODO>` |
| `<th>` | on | `<TODO>` | `<TODO>` |
| `ColumnProfileCard`s mounted | on | `<TODO>` | `<TODO>` |
| DOM nodes | on | `<TODO>` | `<TODO>` |
| Horizontal scroll, p95 frame | on | `<TODO>` ms | `<TODO>` ms |
| Horizontal scroll, frames > 16.7 ms | on | `<TODO>` | `<TODO>` |
| Click cell → edit input | on | `<TODO>` ms | `<TODO>` ms |
| Next page | on | `<TODO>` ms | `<TODO>` ms |
| Toggle Column Profiles | n/a | `<TODO>` ms | `<TODO>` ms |

DOM counts are from `querySelectorAll` in the console. Scroll timings are the median of 3 programmatic runs at 80 px/frame. Interaction timings are Event Timing durations, median of 5.

**Out of scope** (possible follow-ups): `TableSkeleton` still draws every column on a first load with a known schema; user-adjustable column widths in virtualized mode.

Closes #551

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [x] Performance improvement (no behaviour change at or below 50 columns)

## How Has This Been Tested?

24 new tests:
- **`computeColumnWindow`** (12), each also asserting the width invariant: start, middle and end of scroll; overscan 0 vs 3; pinned column before or after the window; pinned indices that are in-window or out of range are ignored; column count shrinking under a stale `scrollLeft`, including a pinned index left out of range; zero-width viewport; negative `scrollLeft`; zero columns.
- **`useColumnWindow`** (4): disabled returns `null` and attaches no listener; scroll events coalesce into one animation frame; a scroll within the same window doesn't re-render; unmount removes the listener and cancels a pending frame.
- **`Table.virtualization.test.tsx`** (8). These use 200 columns with a rotated `columnOrder`, so display and backend indices differ.
  - The rendered `columnheader` count is a small window, with S.No. present and correct `aria-colcount`/`aria-colindex`.
  - Mocked `clientWidth`/`scrollLeft` plus a scroll event shift the window, and every row keeps the same cell count.
  - Scrolling to the far right and running Delete Column on the last header sends that column's real backend index (36, not 199).
  - A cell edit stays mounted after its column scrolls out of view (same node, typed value intact), and Escape releases the pin.
  - A dragged header stays mounted after scrolling away, and the drop lands at the absolute target.
  - With profiles on, the profile row is windowed in step with the other rows.
  - At 50 columns, everything renders with no spacers, `aria-colcount` or inline styles.
  - At 51 columns, virtualization switches on.

Each of these regressions fails at least one of the new tests: dropping the edit pin, dropping the drag pin, re-basing indices, dropping the spacers, or `>=` instead of `>` at the threshold. The new tests produce no `act()` warnings.

`npm run test` → 543 passed. `npm run lint` (ESLint + `tsc --noEmit`) and `npm run build` are clean. All six existing `Table.*.test.tsx` files pass unmodified.

I also checked a 300-column table in a real browser:
- column offsets are exactly `64 + d × 160` in every header and body row;
- `scrollWidth` is constant;
- the window covers the viewport at the start, middle and end;
- the sticky S.No. column covers scrolled columns in all rows;
- a cell edit's input survives being scrolled 290 columns away as the same DOM node, still focused.

- [x] Existing tests pass
- [x] New tests added
- [x] Manual testing

## Screenshots (if applicable)

`<TODO: optional: the wide table scrolled to the middle, with a truncated value's tooltip showing>`

## Checklist

- [x] My code follows the project's style guidelines
- [x] I have performed a self-review
- [ ] I have added/updated documentation as needed
- [x] My changes generate no new warnings
- [x] Tests pass locally

🤖 Generated with [Claude Code](https://claude.com/claude-code)
