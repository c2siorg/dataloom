/**
 * API functions for data profiling (dataset summary, column profiles, correlation).
 * @module api/profiling
 */
import client from "./client";

/** Top-level overview of a dataset. All percentages are 0–100. */
export interface DatasetSummary {
  row_count: number;
  column_count: number;
  total_missing_cells: number;
  missing_cell_percentage: number;
  duplicate_row_count: number;
  memory_usage_bytes: number;
  dtype_counts: Record<string, number>;
  numeric_columns: string[];
  categorical_columns: string[];
  boolean_columns: string[];
  datetime_columns: string[];
}

/** A value/count/percentage entry in a categorical column profile. */
export interface TopValue {
  value: string;
  count: number;
  percentage: number;
}

/**
 * Type-aware profile of a single column. The common fields are always present;
 * the numeric, categorical, and datetime blocks are populated per dtype and
 * null otherwise.
 */
export interface ColumnProfile {
  column: string;
  dtype: string;
  row_count: number;
  null_count: number;
  null_percentage: number;
  unique_count: number;
  unique_percentage: number;
  distribution: string;

  // Numeric block
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  std: number | null;
  q1: number | null;
  q3: number | null;
  skew: number | null;
  zero_count: number | null;
  negative_count: number | null;

  // Categorical block
  top_values: TopValue[] | null;
  cardinality: number | null;
  dominant_value_percentage: number | null;
  rare_value_count: number | null;

  // Boolean block
  true_count: number | null;
  false_count: number | null;
  true_percentage: number | null;

  // Datetime block
  min_date: string | null;
  max_date: string | null;
  range_days: number | null;
  inferred_granularity: string | null;
}

/** Pairwise Pearson correlation over numeric columns; cells may be null. */
export interface Correlation {
  columns: string[];
  matrix: (number | null)[][];
}

/**
 * Fetch a top-level summary of the project's dataset.
 * @param projectId - The project ID.
 * @returns Row/column counts, missing cells, duplicate rows, and dtype mix.
 */
export const getDatasetSummary = async (projectId: string): Promise<DatasetSummary> => {
  const response = await client.get<DatasetSummary>(`/projects/${projectId}/profile/summary`);
  return response.data;
};

/**
 * Fetch a type-aware profile of a single column.
 * @param projectId - The project ID.
 * @param columnName - The column to profile.
 * @returns The column profile.
 */
export const getColumnProfile = async (
  projectId: string,
  columnName: string,
): Promise<ColumnProfile> => {
  const response = await client.get<ColumnProfile>(`/projects/${projectId}/profile/column`, {
    params: { column_name: columnName },
  });
  return response.data;
};

/**
 * Fetch type-aware profiles for every column in one request.
 *
 * Preferred over calling {@link getColumnProfile} per column: the backend reads
 * the dataset once instead of once per column.
 * @param projectId - The project ID.
 * @returns The column profiles, in column order.
 */
export const getColumnProfiles = async (projectId: string): Promise<ColumnProfile[]> => {
  const response = await client.get<{ profiles: ColumnProfile[] }>(
    `/projects/${projectId}/profile/columns`,
  );
  return response.data.profiles;
};

/**
 * Fetch the pairwise correlation matrix over the project's numeric columns.
 * @param projectId - The project ID.
 * @returns The numeric column names and their correlation matrix.
 */
export const getCorrelationMatrix = async (projectId: string): Promise<Correlation> => {
  const response = await client.get<Correlation>(`/projects/${projectId}/profile/correlation`);
  return response.data;
};
