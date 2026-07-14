/**
 * API functions for data quality assessment (run, history, stored reports).
 * @module api/quality
 */
import client from "./client";

/** Severity levels for detected quality issues. */
export type IssueSeverity = "low" | "medium" | "high" | "critical";

/** Supported outlier detection methods. */
export type OutlierMethod = "iqr" | "zscore";

/** A user-defined validity rule: values in `column` must fully match `pattern`. */
export interface PatternRule {
  column: string;
  pattern: string;
  severity: IssueSeverity;
}

/** Configuration for an assessment run. All fields have safe backend defaults. */
export interface QualityAssessConfig {
  outlier_method?: OutlierMethod;
  outlier_sensitivity?: number | null;
  pattern_rules?: PatternRule[];
}

/** A single detected quality issue. `sample_rows` are 0-based row positions. */
export interface QualityIssue {
  issue_type: string;
  severity: IssueSeverity;
  column: string | null;
  count: number;
  detail: string;
  sample_rows: number[];
}

/** A suggested fix; `operation` names an existing transform where one applies. */
export interface QualityRemediation {
  issue_type: string;
  column: string | null;
  suggestion: string;
  operation: string | null;
}

/** A full quality assessment report. Scores are 0–100. Computed on demand. */
export interface QualityReport {
  overall_score: number;
  issue_count: number;
  issues: QualityIssue[];
  remediations: QualityRemediation[];
  column_scores: Record<string, number>;
}

/**
 * Run a quality assessment on the project's current data. Nothing is persisted
 * server-side; the report reflects the working copy at call time.
 * @param projectId - The project ID.
 * @param config - Optional detector configuration (outlier method, pattern rules).
 * @returns The full scored report.
 */
export const runQualityAssessment = async (
  projectId: string,
  config: QualityAssessConfig = {},
): Promise<QualityReport> => {
  const response = await client.post<QualityReport>(`/projects/${projectId}/quality`, config);
  return response.data;
};
