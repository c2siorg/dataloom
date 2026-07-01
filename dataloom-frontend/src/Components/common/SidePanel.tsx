import { X } from "lucide-react";
import type { ReactNode } from "react";

interface SidePanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Right-docked drawer for workspace forms and panels. Rendered as a flex sibling
 * of the table so it pushes the table aside rather than overlaying it. Header
 * shows the title + close button; the body scrolls vertically.
 */
const SidePanel = ({ title, onClose, children }: SidePanelProps) => {
  return (
    <aside
      data-testid="side-panel"
      aria-label={title}
      className="flex w-96 shrink-0 flex-col border-l border-gray-200 bg-white"
    >
      <div className="flex items-center justify-between border-b bg-gray-50 border-gray-200 h-9 px-4">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          data-testid="side-panel-close"
          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
    </aside>
  );
};

export default SidePanel;
