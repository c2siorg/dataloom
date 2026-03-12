import { useState, useCallback } from "react";

/**
 * Manages context menu open/close state, viewport position,and arbitrary
 * context payload.
 *
 * Note: This hook only manages state. Event listeners such as click-outside,
 * Escape key handling, and scroll closing are handled by the consumer
 * component (`ContextMenu`), which attaches and cleans up those listeners.
 *
 * @returns {{
 *   isOpen: boolean,
 *   position: { x: number, y: number },
 *   contextData: object | null,
 *   open: (e: MouseEvent, data: object) => void,
 *   close: () => void
 * }}
 */

export function useContextMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [contextData, setContextData] = useState(null);

  const open = useCallback((e, data) => {
    e.preventDefault();
    setPosition({ x: e.clientX, y: e.clientY });
    setContextData(data);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setContextData(null);
  }, []);

  return { isOpen, position, contextData, open, close };
}
