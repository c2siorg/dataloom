/**
 * Hook to manage modal open/close state.
 * @module hooks/useModal
 */
import { useState, useCallback } from "react";

/**
 * Simple modal state manager.
 * @param {boolean} [initialOpen=false]
 * @returns {{ isOpen: boolean, open: Function, close: Function, toggle: Function }}
 */
export function useModal(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  return { isOpen, open, close, toggle };
}
