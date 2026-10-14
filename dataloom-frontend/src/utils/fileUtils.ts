/** Upload limit used until the server's own limit has been fetched. */
export const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ACCEPTED_EXTENSIONS = [".csv", ".tsv", ".json", ".xls", ".xlsx", ".parquet"];

/** Outcome of `validateFile`. `error` is present only when `valid` is false. */
export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Format a size limit in megabytes the way the backend does: "10 MB", or
 * "10.5 MB" when it is not a whole number of megabytes.
 */
export function formatSizeLimit(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/** The message shown when a file is over the upload limit. */
export function fileTooLargeMessage(fileSize: number, maxBytes: number): string {
  const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
  return `File too large (${sizeMB} MB). Maximum allowed size is ${formatSizeLimit(maxBytes)}.`;
}

/**
 * Return the message for an upload that failed because the file is too large,
 * or null when the failure has another cause.
 *
 * A 413 always counts; the server's own detail is used when it sent one. A
 * failure with no response counts when the file is over the limit, because
 * browsers often report an early 413 as a network error.
 */
export function uploadLimitError(err: unknown, file: File, maxBytes: number): string | null {
  const response = (err as { response?: { status?: number; data?: { detail?: unknown } } } | null)
    ?.response;
  if (response?.status === 413) {
    const detail = response.data?.detail;
    return typeof detail === "string" && detail ? detail : fileTooLargeMessage(file.size, maxBytes);
  }
  if (!response && file.size > maxBytes) {
    return fileTooLargeMessage(file.size, maxBytes);
  }
  return null;
}

export function validateFile(
  file: File | null | undefined,
  maxBytes = DEFAULT_MAX_FILE_SIZE_BYTES,
): FileValidationResult {
  if (!file) {
    return { valid: false, error: "Please select a file to upload." };
  }

  const isSupported = ACCEPTED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));

  if (!isSupported) {
    return {
      valid: false,
      error: `Unsupported file type. Allowed: ${ACCEPTED_EXTENSIONS.join(", ")}`,
    };
  }

  if (file.size > maxBytes) {
    return { valid: false, error: fileTooLargeMessage(file.size, maxBytes) };
  }

  return { valid: true };
}
