import { useEffect, useRef } from "react";

/**
 * Accessible modal dialog with glassmorphism styling.
 */
export default function Modal({ isOpen, onClose, title, children }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative glass-card max-w-lg w-full max-h-[90vh] overflow-y-auto animate-scale-in"
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800/60">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <button
              onClick={onClose}
              className="text-surface-400 hover:text-surface-200 text-xl transition-colors duration-150 w-8 h-8 rounded-lg hover:bg-surface-800/60 flex items-center justify-center"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
