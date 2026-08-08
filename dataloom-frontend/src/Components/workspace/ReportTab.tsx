import { useCallback, useEffect, useRef, useState } from "react";
import { LuTriangleAlert } from "react-icons/lu";
import { usePanel } from "../../context/PanelContext";
import { useReportView } from "../../context/ReportViewContext";
import Button from "../common/Button";
import PdfDocumentView from "../report/PdfDocumentView";
import type { WorkspaceTab } from "../../context/WorkspaceTabsContext";

/** The panel this tab is paired with; it stays open for as long as the tab does. */
const REPORT_PANEL = "ReportConfig";

/**
 * Report tab — the preview surface. Section choices live in the docked side
 * panel (see ReportConfigPanel); this tab draws the generated PDF itself, so
 * the preview is the document rather than a rendering of it.
 *
 * The tab and its panel are one screen: the preview is useless without the
 * section choices and the Download button beside it, so the panel opens with the
 * tab, cannot be dismissed while it is shown, and closes when the tab does.
 *
 * Opening the tab builds a report once. After that, changing sections or the
 * data marks the preview stale and offers a rebuild, because each build costs a
 * full document render plus a quality assessment.
 */
export function ReportTab() {
  const { blob, filename, loading, error, stale, generate } = useReportView();
  const { activePanel, openPanel, closePanel } = usePanel();

  // Only the active tab is mounted, so this pairs the panel with the tab's life.
  // The ref lets teardown read the panel that is open *then*, without re-running
  // the effect — and so leaves alone a panel some other feature has since opened.
  const activePanelRef = useRef(activePanel);
  useEffect(() => {
    activePanelRef.current = activePanel;
  }, [activePanel]);
  useEffect(() => {
    openPanel(REPORT_PANEL);
    return () => {
      if (activePanelRef.current === REPORT_PANEL) closePanel();
    };
  }, [openPanel, closePanel]);

  // The count is tied to the document it was read from, so a rebuild shows no
  // count until the new document reports one, rather than the old one's.
  const [counted, setCounted] = useState<{ blob: Blob; pages: number } | null>(null);
  const pageCount = counted?.blob === blob ? counted.pages : null;

  // Build once per mount at most; the ref keeps a failed build from looping
  // (the error state offers a manual retry instead).
  const autoBuilt = useRef(false);
  useEffect(() => {
    if (!autoBuilt.current && blob === null && !loading && !error) {
      autoBuilt.current = true;
      generate();
    }
  }, [blob, loading, error, generate]);

  const handleLoad = useCallback((pages: number) => blob && setCounted({ blob, pages }), [blob]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-4">
      {stale && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400">
          <span className="flex items-center gap-1.5">
            <LuTriangleAlert className="h-4 w-4 shrink-0" />
            This preview is out of date.
          </span>
          <Button type="button" variant="secondary" onClick={generate} disabled={loading}>
            Rebuild
          </Button>
        </div>
      )}

      {error ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          Couldn’t build the report.
          <Button type="button" variant="secondary" onClick={generate}>
            Try again
          </Button>
        </div>
      ) : blob ? (
        <>
          <div className="flex items-baseline gap-2 px-1 pb-2 text-xs text-muted-foreground">
            <span className="truncate font-medium text-foreground">{filename}</span>
            <span>
              {pageCount === null ? "—" : `${pageCount} page${pageCount === 1 ? "" : "s"}`}
            </span>
          </div>
          <PdfDocumentView blob={blob} onLoad={handleLoad} />
        </>
      ) : (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          Building the report…
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const REPORT_TAB: WorkspaceTab = {
  id: "report",
  title: "Report",
  type: "report",
  closeable: true,
};
