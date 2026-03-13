import { useState, useEffect, useRef, useLayoutEffect } from "react";
import PropTypes from "prop-types";
const ContextMenu = ({ isOpen, position, contextData, onClose, actions }) => {
  const menuRef = useRef(null);

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

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) onClose();
    };
    const handleKeyDown = (event) => {
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
      data-testid={contextData ? `context-menu-${contextData.type}` : "context-menu"}
      aria-label="Context menu"
      className="fixed bg-white border border-gray-200 rounded-lg shadow-lg p-1 z-50"
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

ContextMenu.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  position: PropTypes.shape({
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
  }).isRequired,
  contextData: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  actions: PropTypes.func.isRequired,
};

export default ContextMenu;
