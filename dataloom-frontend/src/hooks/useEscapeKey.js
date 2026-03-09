import { useEffect } from "react";

export const useEscapeKey = (onEscape) => {
  useEffect(() => {
    if (!onEscape) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onEscape();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onEscape]);
};
