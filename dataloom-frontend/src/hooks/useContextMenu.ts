import { useState, useCallback, type MouseEvent as ReactMouseEvent } from "react";

/**
 * Manages context menu open/close state, viewport position, and arbitrary
 * context payload.
 *
 * Note: This hook only manages state. Event listeners such as click-outside,
 * Escape key handling, and scroll closing are handled by the consumer
 * component (`ContextMenu`), which attaches and cleans up those listeners.
 *
 * @typeParam T - Shape of the payload the consumer attaches to the menu.
 */
export function useContextMenu<T = unknown>() {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [contextData, setContextData] = useState<T | null>(null);

  const open = useCallback((e: MouseEvent | ReactMouseEvent, data: T) => {
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
