import { useEffect, useState } from "react";
import { getUploadLimits } from "../api/projects";
import { DEFAULT_MAX_FILE_SIZE_BYTES } from "../utils/fileUtils";

interface UseUploadLimitsResult {
  /** The server's upload limit, or the default until (or unless) it loads. */
  maxUploadSizeBytes: number;
}

/**
 * Fetch the server's upload limit once per mount. If the request fails, the
 * default limit stays in place and the server still enforces its own.
 */
export default function useUploadLimits(): UseUploadLimitsResult {
  const [maxUploadSizeBytes, setMaxUploadSizeBytes] = useState(DEFAULT_MAX_FILE_SIZE_BYTES);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const limits = await getUploadLimits();
        if (active) setMaxUploadSizeBytes(limits.max_upload_size_bytes);
      } catch {
        // Keep the default.
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  return { maxUploadSizeBytes };
}
