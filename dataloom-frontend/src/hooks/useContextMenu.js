/**
 * Hook to manage context menu state and keyboard navigation.
 * @module hooks/useContextMenu
 */
import { useState, useEffect, useCallback } from "react";

/**
 * Manages context menu open/close, position, and keyboard handling.
 * @returns {{ isOpen: boolean, position: {x,y}, targetIndex: number|null, open: Function, close: Function }}
 */
export function useContextMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [targetIndex, setTargetIndex] = useState(null);

  const open = useCallback((e, index) => {
    e.preventDefault();
    setPosition({ x: e.clientX, y: e.clientY });
    setTargetIndex(index);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setTargetIndex(null);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = () => close();
    const handleKeyDown = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, close]);

  return { isOpen, position, targetIndex, open, close };
}
