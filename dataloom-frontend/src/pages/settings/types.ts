export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface Project {
  project_id: string;
  name: string;
  description: string | null;
  last_modified: string;
}

export interface ProjectDetails {
  project_id: string;
  filename: string;
  description: string | null;
  file_path: string;
  columns: string[];
  rows: unknown[][];
  dtypes: Record<string, string>;
  total_rows: number;
  total_pages: number;
  page: number;
  page_size: number;
}

export interface Toast {
  message: string;
  type: "success" | "error" | "info" | "warning";
}
