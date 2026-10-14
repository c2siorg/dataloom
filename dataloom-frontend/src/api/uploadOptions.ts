/**
 * Request options shared by every file-upload call.
 * @module api/uploadOptions
 */
import type { AxiosRequestConfig } from "axios";
import { UPLOAD_TIMEOUT_MS } from "../config/apiConfig";

/** Progress and cancellation hooks for an upload request. */
export interface UploadOptions {
  /** Called with the fraction (0 to 1) of the request body sent so far. */
  onProgress?: (fraction: number) => void;
  /** Aborts the upload when signalled. */
  signal?: AbortSignal;
}

/**
 * Build the Axios config for an upload: the upload timeout instead of the
 * client's default, upload progress, and an abort signal.
 * @param options - Optional progress callback and abort signal.
 * @returns Axios request config.
 */
export const uploadRequestConfig = (options?: UploadOptions): AxiosRequestConfig => {
  const onProgress = options?.onProgress;
  return {
    timeout: UPLOAD_TIMEOUT_MS,
    signal: options?.signal,
    onUploadProgress: onProgress
      ? (event) => {
          if (event.total) onProgress(event.loaded / event.total);
        }
      : undefined,
  };
};
