import { useState } from "react";

const useError = () => {
  const [error, setError] = useState(null);

  const clearError = () => setError(null);

  const handleError = (err) => {
    setError(err.response?.data?.detail || "Something went wrong. Please try again.");
  };

  return { error, setError, clearError, handleError };
};

export default useError;
