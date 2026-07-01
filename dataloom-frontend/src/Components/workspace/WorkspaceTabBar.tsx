import { Plus, X } from "lucide-react";
import { useWorkspaceTabs } from "../../context/WorkspaceTabsContext";

interface WorkspaceTabBarProps {
  /** When provided, renders a trailing "+" button that invokes this. */
  onAddTab?: () => void;
}

/**
 * VS Code–style tab strip for the project workspace. Reads open tabs from
 * WorkspaceTabsContext; selecting a tab activates it and the × closes it.
 */
const WorkspaceTabBar = ({ onAddTab }: WorkspaceTabBarProps) => {
  const { tabs, activeTabId, setActiveTab, closeTab } = useWorkspaceTabs();

  return (
    <div
      role="tablist"
      aria-label="Open tables"
      className="flex h-9 shrink-0 items-stretch overflow-hidden border-b border-gray-200 bg-gray-50"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const closeable = tab.closeable ?? true;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setActiveTab(tab.id);
              }
            }}
            data-testid={`workspace-tab-${tab.id}`}
            className={`group flex shrink-0 cursor-pointer items-center gap-2 border-r border-gray-200 px-3 py-1.5 text-sm transition-colors ${
              isActive
                ? "-mb-px border-b-2 border-b-blue-500 bg-white font-medium text-blue-600"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            <span className="max-w-45 truncate">{tab.title}</span>
            {closeable && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                aria-label={`Close ${tab.title}`}
                data-testid={`workspace-tab-close-${tab.id}`}
                className="flex h-4 w-4 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}

      {onAddTab && (
        <button
          type="button"
          onClick={onAddTab}
          aria-label="New tab"
          data-testid="workspace-tab-add"
          className="flex shrink-0 items-center px-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

export default WorkspaceTabBar;
