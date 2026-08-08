/**
 * API functions for downloadable project reports.
 * @module api/reports
 */
import client from "./client";

/** The parts a report can carry. The dataset overview always prints. */
export type ReportSection = "overview" | "profiles" | "quality" | "provenance";

/** A generated report: the PDF itself, plus the filename the server chose. */
export interface GeneratedReport {
  blob: Blob;
  filename: string;
}

/**
 * Generate a project report and return the PDF.
 *
 * The same bytes are used for the preview and for the download, so what the
 * user approves on screen is exactly what lands on disk.
 *
 * @param projectId - The project ID.
 * @param sections - Sections to include. Omitting this asks for all of them.
 * @returns The PDF blob and its suggested filename.
 */
export const getProjectReport = async (
  projectId: string,
  sections?: ReportSection[],
): Promise<GeneratedReport> => {
  // The server includes every section when the request names none, so an empty
  // choice has to say "overview" out loud — otherwise clearing every checkbox
  // would return the full report instead of the overview alone.
  const requested = sections && (sections.length > 0 ? sections : ["overview"]);
  const response = await client.get<Blob>(`/projects/${projectId}/report`, {
    responseType: "blob",
    params: requested ? { section: requested } : undefined,
    // Axios brackets repeated params by default; FastAPI expects section=a&section=b.
    paramsSerializer: { indexes: null },
  });
  const disposition = (response.headers["content-disposition"] as string) || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  return { blob: response.data, filename: match?.[1] ?? "report.pdf" };
};
