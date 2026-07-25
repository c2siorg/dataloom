import { useState, useEffect, useRef } from "react";
import { Plus, X } from "lucide-react";
import { useWorkspaceTabs } from "../../context/WorkspaceTabsContext";
import { useProfilingMenuItems } from "./useProfilingMenu";

/**
 * VS Code–style tab strip for the project workspace. Reads open tabs from
 * WorkspaceTabsContext; selecting a tab activates it and the × closes it.
 * The "+" button directly follows open tabs and opens a dropdown menu of the
 * Profiling actions, derived from the feature registry via useProfilingMenu.
 */
const WorkspaceTabBar = () => {
  const { tabs, activeTabId, setActiveTab, closeTab } = useWorkspaceTabs();
  const profilingOptions = useProfilingMenuItems();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  /** Roving focus position within the menu, per the ARIA menu pattern. */
  const [activeIndex, setActiveIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const openDropdown = (index: number) => {
    setActiveIndex(index);
    setIsDropdownOpen(true);
  };

  /** Close and hand focus back to the trigger, so keyboard users aren't stranded. */
  const closeDropdown = (refocus = true) => {
    setIsDropdownOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  // Close on click outside or Escape.
  useEffect(() => {
    if (!isDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDropdownOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDropdownOpen]);

  // Move real focus to the active item so screen readers follow the menu.
  useEffect(() => {
    if (!isDropdownOpen) return;
    itemRefs.current[activeIndex]?.focus();
  }, [isDropdownOpen, activeIndex]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const lastIndex = profilingOptions.length - 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((prev) => (prev >= lastIndex ? 0 : prev + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((prev) => (prev <= 0 ? lastIndex : prev - 1));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(lastIndex);
        break;
      case "Tab":
        // Tabbing out of a menu dismisses it; let focus continue naturally.
        closeDropdown(false);
        break;
      default:
        break;
    }
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openDropdown(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openDropdown(profilingOptions.length - 1);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Open tables"
      className="relative flex h-9 shrink-0 items-stretch border-b border-app-border bg-surface z-40"
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
            className={`group flex shrink-0 cursor-pointer items-center gap-2 border-r border-app-border px-3 py-1.5 text-sm transition-colors ${
              isActive
                ? "-mb-px border-b-2 border-b-blue-500 bg-surface font-medium text-blue-600"
                : "text-muted-foreground hover:bg-surface-hover"
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
                className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-surface hover:text-gray-700"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}

      <div ref={dropdownRef} className="relative flex items-center shrink-0">
        <button
          type="button"
          ref={triggerRef}
          onClick={() => (isDropdownOpen ? closeDropdown(false) : openDropdown(0))}
          onKeyDown={handleTriggerKeyDown}
          aria-label="Profiling options"
          aria-expanded={isDropdownOpen}
          aria-haspopup="menu"
          data-testid="workspace-tab-add"
          className="flex h-full shrink-0 items-center px-3 text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors border-r border-app-border"
        >
          <Plus className="h-4 w-4" />
        </button>

        {isDropdownOpen && (
          <div
            role="menu"
            aria-label="Profiling options"
            data-testid="workspace-add-tab-dropdown"
            onKeyDown={handleMenuKeyDown}
            className="absolute left-0 top-full mt-1 w-48 rounded-md border border-app-border bg-surface shadow-xl py-1 z-50"
          >
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-app-border/60 mb-1">
              Profiling Options
            </div>
            {profilingOptions.map((opt, index) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="menuitem"
                  ref={(node) => {
                    itemRefs.current[index] = node;
                  }}
                  tabIndex={index === activeIndex ? 0 : -1}
                  data-testid={`workspace-add-tab-option-${opt.id}`}
                  onClick={() => {
                    opt.onClick();
                    closeDropdown();
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-hover hover:text-blue-600 transition-colors text-left"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkspaceTabBar;
