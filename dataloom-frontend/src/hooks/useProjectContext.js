import { useContext } from "react";
import { ProjectContext } from "../context/ProjectContext";

/**
 * Hook to access project state and actions.
 * @returns {{ projectId: string, columns: string[], rows: Array[], loading: boolean, error: string|null, projectName: string, refreshProject: Function, updateData: Function, setProjectInfo: Function }}
 */
export function useProjectContext() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error("useProjectContext must be used within ProjectProvider");
  return context;
}
