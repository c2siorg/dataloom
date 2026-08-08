/**
 * Save a blob to the user's disk under the given filename.
 *
 * The object URL is created and revoked around a single synthetic click, so the
 * caller keeps the blob and nothing leaks.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
