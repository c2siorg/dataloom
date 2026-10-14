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
  getUploadLimits,
} from "./projects";
export type { ExportOptions, ExportResult, UploadLimits } from "./projects";
export type { UploadOptions } from "./uploadOptions";
export { getLogs, getCheckpoints, deleteCheckpoint } from "./logs";
export type { Checkpoint, LogEntry } from "./logs";
export {
  transformProject,
  groupByTransform,
  undoLastTransformation,
  redoLastTransformation,
  getUndoState,
} from "./transforms";
export type {
  TransformationInput,
  TransformOptions,
  TransformResult,
  UndoState,
} from "./transforms";
export type { CellValue, Pagination, ProjectDetails, ProjectSummary, TableResponse } from "./types";
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
