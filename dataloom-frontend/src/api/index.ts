/**
 * Barrel export for all API modules.
 * @module api
 */
export {
  uploadProject,
  getProjectDetails,
  getRecentProjects,
  saveProject,
  revertToCheckpoint,
  exportProject,
  deleteProject,
  searchProjects,
  updateProject,
  getProjectMeta,
  getProjects,
} from "./projects";
export type { ExportOptions, ExportResult, ProjectDetails } from "./projects";
export { getLogs, getCheckpoints, deleteCheckpoint } from "./logs";
export type { Checkpoint, LogEntry } from "./logs";
export { transformProject, groupByTransform, undoLastTransformation } from "./transforms";
export type { TransformationInput, TransformOptions, TransformResult } from "./transforms";
export type { CellValue, Pagination, ProjectSummary, TableResponse } from "./types";
export { signup, signin, logout, getCurrentUser } from "./auth";
export {
  getDatasetSummary,
  getColumnProfile,
  getColumnProfiles,
  getCorrelationMatrix,
} from "./profiling";
export { getChartSuggestions, getChart } from "./visualizations";
export { runQualityAssessment } from "./quality";
export { getProjectReport } from "./reports";
export {
  previewAddFile,
  addFileToProject,
  getProjectFiles,
  reappendProjectFile,
} from "./projectFiles";
export {
  createPipeline,
  getPipelines,
  deletePipeline,
  checkPipeline,
  checkDraftPipelineSteps,
  applyPipeline,
} from "./pipelines";
