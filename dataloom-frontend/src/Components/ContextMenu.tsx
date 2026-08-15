import { useState, useEffect, useRef, useLayoutEffect, type ReactNode } from "react";

interface Position {
  x: number;
  y: number;
}

interface ContextMenuProps<T> {
  isOpen: boolean;
  position: Position;
  contextData: T | null;
  onClose: () => void;
  actions: (contextData: T | null) => ReactNode;
  "data-testid"?: string;
}

const ContextMenu = <T,>({
  isOpen,
  position,
  contextData,
  onClose,
  actions,
  "data-testid": testId,
}: ContextMenuProps<T>) => {
  const menuRef = useRef<HTMLDivElement>(null);

  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // useLayoutEffect (not useEffect) ensures clamping runs synchronously
  // before the browser paints, preventing visible position jump.
  useLayoutEffect(() => {
    if (!isOpen) return;

    const menuEl = menuRef.current;
    if (!menuEl) return;

    const rect = menuEl.getBoundingClientRect();

    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    let newX = position.x;
    let newY = position.y;

    if (newX + rect.width > viewportWidth) {
      newX = viewportWidth - rect.width - 8;
    }

    if (newY + rect.height > viewportHeight) {
      newY = viewportHeight - rect.height - 8;
    }

    newX = Math.max(8, newX);
    newY = Math.max(8, newY);

    setAdjustedPosition({ x: newX, y: newY });
  }, [isOpen, position]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const handleScroll = () => onClose();

    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    // Close the context menu on any scroll event.
    // Using capture phase ensures scrolling inside nested containers
    // (like the table's overflow area) also closes the menu.
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Context menu"
      className="fixed bg-surface border border-app-border rounded-lg shadow-lg p-1 z-50"
      data-testid={testId}
      style={{
        top: adjustedPosition.y,
        left: adjustedPosition.x,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      {actions(contextData)}
    </div>
  );
};

export default ContextMenu;
