---
name: Feature Request
about: Suggest a new feature or improvement
title: '[Feature] Virtualize columns in Table for wide datasets'
labels: enhancement
assignees: ''
---

**Is your feature request related to a problem?**
The backend paginates rows (page size 10 to 100), but `Table.tsx` renders every column. Each column appears in up to three header rows (profile card, name, dtype badge) and in every body row. A 300-column CSV at page size 100 puts 30,000 `<td>`s and 900 `<th>`s in the DOM. With the Columns toggle on, it also mounts 300 `ColumnProfileCard`s. Horizontal scrolling, entering a cell edit and re-rendering after a transform all slow down as the column count grows. Row count is already capped, so column count is the problem.

**Describe the solution you'd like**
Render only the columns in the horizontal viewport, plus a small overscan. Spacer cells hold the full scroll width.

- A pure `computeColumnWindow()` returns which columns to render and how wide the left and right spacers are. A `useColumnWindow` hook feeds it the scroll position, using a passive scroll listener throttled with `requestAnimationFrame` and a `ResizeObserver` on the scroll container. This needs no new dependency.
- The S.No. column stays sticky and is always rendered.
- Every handler (header sort, drag-reorder, context menu, cell edit) keeps receiving the same absolute column index it gets today. Virtualization only decides which columns are in the DOM.
- The column being edited and the column being dragged stay rendered when scrolled out of view. Otherwise the edit input or the drag source would unmount mid-interaction.
- When virtualized, the table sets `aria-colcount` and each rendered cell sets `aria-colindex`. Spacers are `aria-hidden`.

**Trade-off: fixed column width.** Windowing needs to know where each column starts, so columns need a fixed width. Today they size to their content. To keep the common case unchanged, virtualization only turns on above a column-count threshold (proposed: 50). At or below the threshold the table renders exactly as it does now. Above it, columns use a fixed width (proposed: 160px) with `table-layout: fixed`. Long values truncate with an ellipsis, and the full value is in a `title` tooltip.

**Describe alternatives you've considered**
- **`@tanstack/react-virtual`.** It's well maintained, but it adds a dependency for what is a few lines of arithmetic once column widths are fixed. It also doesn't remove the fixed-width requirement.
- **CSS `content-visibility: auto`.** The browser skips layout and paint for off-screen cells, but every node stays in the DOM and in React's reconciliation. That's where the cost is (mounting 30k cells, re-rendering after each transform), so it doesn't fix the problem. It also doesn't apply cleanly to table cells.
- **Paginating columns on the server.** This changes the API and the context, and paging through columns is awkward for horizontal browsing.

**Additional context**
I'd like to work on this. The PR will include before/after `<td>` counts and scroll measurements on a 300-column × 1000-row CSV, with column profiles on and off. Feedback on the threshold and the fixed width is welcome.
