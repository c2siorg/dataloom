const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".json", ".parquet", ".tsv"];

export function validateFile(file) {
  if (!file) {
    return { valid: false, error: "No file selected." };
  }

  if (file.size === 0) {
    return { valid: false, error: "File is empty (0 bytes)." };
  }

  const name = file.name || "";
  const dotIndex = name.lastIndexOf(".");

  if (dotIndex <= 0 || dotIndex === name.length - 1) {
    return {
      valid: false,
      error: `File has no valid extension. Supported: ${ALLOWED_EXTENSIONS.join(", ")}`,
    };
  }

  const ext = name.slice(dotIndex).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `File type "${ext}" is not supported. Supported: ${ALLOWED_EXTENSIONS.join(", ")}`,
    };
  }

  return { valid: true };
}

export const ACCEPT_STRING = ALLOWED_EXTENSIONS.join(",");
