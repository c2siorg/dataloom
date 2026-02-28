import { useState, useCallback } from "react";

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
