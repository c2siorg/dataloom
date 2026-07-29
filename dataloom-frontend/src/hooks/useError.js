import { useState } from "react";
import { getErrorMessage } from "../utils/errorUtils";

const useError = () => {
  const [error, setError] = useState(/** @type {string | null} */ (null));

  const clearError = () => setError(null);

  const handleError = (err) => {
    setError(getErrorMessage(err));
  };

  return { error, setError, clearError, handleError };
};

export default useError;
