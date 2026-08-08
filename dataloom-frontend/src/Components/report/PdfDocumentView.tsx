import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";

/**
 * Renders PDF bytes as page sheets, using pdf.js rather than the browser's own
 * viewer so the surround is ours to style. See
 * `docs/adr/0004-reports-are-server-rendered-pdfs.md` — this draws the same
 * bytes the user downloads, it does not re-render the report from data.
 *
 * pdf.js is imported dynamically so it stays out of the main bundle; only the
 * Report tab pays for it.
 */

/** Milliseconds of quiet before a resize triggers a re-render of every page. */
const RESIZE_DEBOUNCE_MS = 120;

/** Cache of the dynamic import, so a second open doesn't re-fetch the library. */
let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

const loadPdfjs = () => {
  pdfjsPromise ??= import("pdfjs-dist").then(async (pdfjs) => {
    // Vite emits the worker as its own asset; pdf.js needs the URL, not the module.
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    return pdfjs;
  });
  return pdfjsPromise;
};

interface PdfPageProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  /** CSS width the sheet should occupy; 0 until the container has been measured. */
  width: number;
}

/**
 * One page sheet. The canvas is sized in CSS pixels to `width` but drawn at the
 * device pixel ratio, or the document's 8pt table type turns to mush on a
 * high-DPI screen.
 */
function PdfPage({ doc, pageNumber, width }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (width <= 0) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;

    void (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;

      const scale = width / page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;

      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      setHeight(viewport.height);

      const render = page.render({ canvas, canvasContext: context, viewport });
      task = render;
      try {
        await render.promise;
      } catch {
        // A cancelled render is the expected outcome of a resize mid-draw.
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, width]);

  return (
    <canvas
      ref={canvasRef}
      data-testid={`report-page-${pageNumber}`}
      aria-label={`Report page ${pageNumber}`}
      className="border border-app-border bg-white shadow-sm"
      style={{ width: width || undefined, height: height || undefined }}
    />
  );
}

interface PdfDocumentViewProps {
  /** The PDF to draw. */
  blob: Blob;
  /** Called with the page count once the document is parsed. */
  onLoad?: (pageCount: number) => void;
}

export default function PdfDocumentView({ blob, onLoad }: PdfDocumentViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [width, setWidth] = useState(0);
  const [failed, setFailed] = useState(false);

  // Measure the sheet width from the scroll container, minus its padding, and
  // re-measure when the tab resizes or the side panel opens and closes.
  const measure = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    const style = window.getComputedStyle(element);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    setWidth(Math.max(0, element.clientWidth - padding));
  }, []);

  useEffect(() => {
    measure();
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(measure, RESIZE_DEBOUNCE_MS);
    });
    observer.observe(element);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [measure]);

  // A rebuild hands us a new document, and the pages that carried the scroll
  // position unmount with the old one. Remember where the reader was and put
  // them back there once the new pages are tall enough to hold the offset.
  const scrollTop = useRef(0);
  const restoreTo = useRef<number | null>(null);
  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const pages = element.firstElementChild;
    if (!pages) return;
    const observer = new ResizeObserver(() => {
      const target = restoreTo.current;
      if (target === null) return;
      if (element.scrollHeight - element.clientHeight < target) return;
      element.scrollTop = target;
      restoreTo.current = null;
    });
    observer.observe(pages);
    return () => observer.disconnect();
  }, [doc]);

  useEffect(() => {
    let cancelled = false;
    // The loading task, not the document, owns teardown of the worker.
    let task: PDFDocumentLoadingTask | null = null;
    setFailed(false);
    restoreTo.current = scrollTop.current || null;

    void (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const loading = pdfjs.getDocument({ data: bytes });
        task = loading;
        const document = await loading.promise;
        if (cancelled) return;
        setDoc(document);
        onLoad?.(document.numPages);
      } catch (err) {
        if (!cancelled) {
          console.error("Error rendering report preview:", err);
          setFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      void task?.destroy();
      setDoc(null);
    };
  }, [blob, onLoad]);

  return (
    <div
      ref={containerRef}
      data-testid="pdf-document-view"
      onScroll={(event) => {
        // Swapping documents scrolls the container to the top by itself. Ignore
        // that, or the position we are about to restore is overwritten with 0.
        if (restoreTo.current === null) scrollTop.current = event.currentTarget.scrollTop;
      }}
      className="min-h-0 flex-1 overflow-auto rounded-md border border-app-border bg-background p-6"
    >
      {failed ? (
        <p className="text-center text-sm text-muted-foreground">
          Couldn’t display this preview. The download still works.
        </p>
      ) : doc ? (
        <div className="flex flex-col items-center gap-6">
          {/* A page's number is its identity here — the list never reorders. */}
          {Array.from({ length: doc.numPages }, (_, index) => index + 1).map((pageNumber) => (
            <PdfPage key={pageNumber} doc={doc} pageNumber={pageNumber} width={width} />
          ))}
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground">Rendering the document…</p>
      )}
    </div>
  );
}
