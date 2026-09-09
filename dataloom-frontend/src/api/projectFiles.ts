/**
 * API functions for adding files to an existing project (append) and the
 * project's file inventory.
 * @module api/projectFiles
 */
import client from "./client";
import type { CellValue } from "./types";

/** A matched column whose simplified dtype differs between the two files. */
export interface DtypeClash {
  column: string;
  existing_dtype: string;
  incoming_dtype: string;
}

/** How an incoming file would align with the project's current data. */
export interface AppendPreview {
  matched_columns: string[];
  new_columns: string[];
  missing_columns: string[];
  dtype_clashes: DtypeClash[];
  current_row_count: number;
  incoming_row_count: number;
}

/** An entry in the project's file inventory (files added after upload). */
export interface ProjectFileEntry {
  id: string;
  original_filename: string;
  uploaded_at: string | null;
}

/** The fields of the append response the panel consumes. */
export interface AppendResult {
  total_rows?: number;
  total_pages?: number;
  page?: number;
  page_size?: number;
  columns: string[];
  rows: CellValue[][];
}

const asForm = (file: File): FormData => {
  const form = new FormData();
  form.append("file", file);
  return form;
};

/**
 * Preview how a file would align with the project's data on append.
 * Stateless — nothing is stored until {@link addFileToProject} confirms.
 * @param projectId - The project ID.
 * @param file - The file to analyze.
 * @returns Matched/new/missing columns, dtype clashes, and row counts.
 */
export const previewAddFile = async (projectId: string, file: File): Promise<AppendPreview> => {
  const response = await client.post<AppendPreview>(
    `/projects/${projectId}/files/preview`,
    asForm(file),
  );
  return response.data;
};

/**
 * Append a file's rows to the project and store it in the file inventory.
 * @param projectId - The project ID.
 * @param file - The file to append.
 * @returns The combined project data.
 */
export const addFileToProject = async (
  projectId: string,
  file: File,
  page?: number,
  pageSize?: number,
): Promise<AppendResult> => {
  const params = new URLSearchParams();
  if (page !== undefined) params.append("page", String(page));
  if (pageSize !== undefined) params.append("page_size", String(pageSize));

  const response = await client.post<AppendResult>(
    `/projects/${projectId}/files?${params.toString()}`,
    asForm(file),
  );
  return response.data;
};

/**
 * Fetch the project's file inventory.
 * @param projectId - The project ID.
 * @returns Files added to the project, oldest first.
 */
export const getProjectFiles = async (projectId: string): Promise<ProjectFileEntry[]> => {
  const response = await client.get<ProjectFileEntry[]>(`/projects/${projectId}/files`);
  return response.data;
};

/**
 * Append an inventory file's rows to the project again (e.g. after a revert
 * removed them).
 * @param projectId - The project ID.
 * @param fileId - The inventory file ID.
 * @returns The combined project data.
 */
export const reappendProjectFile = async (
  projectId: string,
  fileId: string,
  page?: number,
  pageSize?: number,
): Promise<AppendResult> => {
  const params = new URLSearchParams();
  if (page !== undefined) params.append("page", String(page));
  if (pageSize !== undefined) params.append("page_size", String(pageSize));

  const response = await client.post<AppendResult>(
    `/projects/${projectId}/files/${fileId}/append?${params.toString()}`,
  );
  return response.data;
};
