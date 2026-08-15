import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getProjectReport, type GeneratedReport, type ReportSection } from "../api/reports";
import { downloadBlob } from "../utils/downloadBlob";
import { useProjectContext } from "./ProjectContext";

const DEFAULT_SECTIONS: ReportSection[] = ["profiles", "quality", "provenance"];

/**
 * How long the section choices must sit still before the preview rebuilds. Long
 * enough to absorb a run of clicks, short enough to feel like a response to the
 * last one.
 */
const SECTION_REBUILD_DELAY_MS = 600;

/** Order-independent identity of a section choice, for comparing builds. */
const sectionKey = (sections: ReportSection[]) => [...sections].sort().join(",");

interface ReportViewValue {
  /** The generated PDF, which the viewer draws and Download writes to disk. */
  blob: Blob | null;
  /** The filename the server chose, shown above the preview and used on download. */
  filename: string | null;
  loading: boolean;
  error: boolean;
  /** True when the sections or the data changed after the shown report was built. */
  stale: boolean;
  sections: ReportSection[];
  toggleSection: (section: ReportSection) => void;
  /** Build a report from the current sections. */
  generate: () => void;
  /** Save the previewed bytes — no second request, so the file matches the preview. */
  download: () => void;
}

const ReportViewContext = createContext<ReportViewValue | null>(null);

/** Access the shared report view. Bridges the docked config panel and the Report tab. */
// eslint-disable-next-line react-refresh/only-export-components
export function useReportView(): ReportViewValue {
  const context = useContext(ReportViewContext);
  if (!context) throw new Error("useReportView must be used within a ReportViewProvider");
  return context;
}

/**
 * Holds the generated report so the docked config panel (section choices) and
 * the Report tab (the preview) stay in sync.
 *
 * A section choice rebuilds the preview by itself, debounced so that ticking
 * three boxes costs one build rather than three. A *data* change does not: the
 * user did not ask for a report when they transformed the data, so that case
 * marks the preview stale and offers a rebuild instead.
 *
 * The generated PDF is held here so the viewer draws, and Download writes, the
 * very bytes the server sent.
 */
export function ReportViewProvider({ children }: { children: ReactNode }) {
  const { projectId, dataVersion } = useProjectContext();

  const [sections, setSections] = useState<ReportSection[]>(DEFAULT_SECTIONS);
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [builtAt, setBuiltAt] = useState<{ version: number; sections: string } | null>(null);

  // Builds are not guaranteed to come back in the order they were asked for, and
  // a slow earlier one must not overwrite the document the user is looking at.
  const latestRequest = useRef(0);

  const generate = useCallback(async () => {
    if (!projectId) return;
    const request = ++latestRequest.current;
    setLoading(true);
    setError(false);
    try {
      const generated = await getProjectReport(projectId, sections);
      if (request !== latestRequest.current) return;
      setReport(generated);
      setBuiltAt({ version: dataVersion, sections: sectionKey(sections) });
    } catch (err) {
      if (request !== latestRequest.current) return;
      console.error("Error generating report:", err);
      setError(true);
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, [projectId, sections, dataVersion]);

  // Rebuild after a section change, once the user stops clicking. Only after a
  // first build: before that the Report tab has its own opening build to run.
  const sectionsChanged = builtAt !== null && builtAt.sections !== sectionKey(sections);
  useEffect(() => {
    if (!sectionsChanged) return;
    const timer = setTimeout(() => void generate(), SECTION_REBUILD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [sectionsChanged, generate]);

  const download = useCallback(() => {
    if (report) downloadBlob(report.blob, report.filename);
  }, [report]);

  const toggleSection = useCallback((section: ReportSection) => {
    setSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section],
    );
  }, []);

  const value = useMemo<ReportViewValue>(
    () => ({
      blob: report?.blob ?? null,
      filename: report?.filename ?? null,
      loading,
      error,
      // Only a data change leaves the preview stale; a section change rebuilds.
      stale: builtAt !== null && builtAt.version !== dataVersion,
      sections,
      toggleSection,
      generate: () => void generate(),
      download,
    }),
    [report, loading, error, builtAt, dataVersion, sections, toggleSection, generate, download],
  );

  return <ReportViewContext.Provider value={value}>{children}</ReportViewContext.Provider>;
}
