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
  name: string | null;
  description: string | null;
  last_modified: string;
}
