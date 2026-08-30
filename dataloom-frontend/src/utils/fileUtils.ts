export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
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

export function validateFile(file: File | null | undefined): FileValidationResult {
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

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);

    return {
      valid: false,
      error: `File too large (${sizeMB} MB). Maximum allowed size is 10 MB.`,
    };
  }

  return { valid: true };
}
