import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  /** Whether the modal is visible. */
  isOpen: boolean;
  /** Callback to close the modal. */
  onClose: () => void;
  /** Modal title text. */
  title?: string;
  /** Modal body content. */
  children: ReactNode;
  /** Optional width/spacing classes for the dialog shell. */
  className?: string;
}

/**
 * Accessible modal dialog component.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  className = "max-w-lg",
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bg-surface rounded-xl shadow-xl ${className} w-full mx-4 max-h-[90vh] overflow-y-auto`}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-app-border">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-xl transition-colors duration-150"
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
