import { useState } from "react";

const useError = () => {
  const [error, setError] = useState(/** @type {string | null} */ (null));

  const clearError = () => setError(null);

  const handleError = (err) => {
    let detail = err.response?.data?.detail;
    if (Array.isArray(detail)) {
      detail = detail.map((e) => e.msg ?? JSON.stringify(e)).join(", ");
    } else if (typeof detail === "object" && detail !== null) {
      detail = JSON.stringify(detail);
    }
    setError(detail || "Something went wrong. Please try again.");
  };

  return { error, setError, clearError, handleError };
};

export default useError;
