import { useEffect, useMemo, useRef, useState } from "react";
import { useProjectContext } from "../../context/ProjectContext";
import DtypeBadge from "./DtypeBadge";

interface ColumnSelectProps {
  value: string;
  onChange: (value: string) => void;
  /** Override the column list; defaults to the project's columns. */
  options?: string[];
  placeholder?: string;
  /** Render a leading option that maps to "" (e.g. "All columns"). */
  includeEmptyOption?: boolean;
  emptyLabel?: string;
  required?: boolean;
  name?: string;
  id?: string;
  disabled?: boolean;
  "data-testid"?: string;
}

/**
 * Searchable, dtype-aware single-column selector. Replaces the native <select>:
 * a trigger button opens a popover with a search box and a list of columns, each
 * annotated with its data-type badge. Reads columns/dtypes from ProjectContext.
 */
const ColumnSelect = ({
  value,
  onChange,
  options,
  placeholder = "Select column...",
  includeEmptyOption = false,
  emptyLabel = "All columns",
  required = true,
  name,
  id,
  disabled = false,
  "data-testid": dataTestId,
}: ColumnSelectProps) => {
  const { columns, dtypes } = useProjectContext();
  const cols = options ?? columns;

  const [open, setOpen] = useState(false);
  // Kept mounted while the close animation plays, then unmounted on animationend.
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(
    () => cols.filter((col) => col.toLowerCase().includes(search.toLowerCase())),
    [cols, search],
  );

  // Options as {value,label}; the empty option (value "") leads when enabled.
  const items = useMemo(() => {
    const list = filtered.map((col) => ({ value: col, label: col }));
    if (includeEmptyOption && emptyLabel.toLowerCase().includes(search.toLowerCase())) {
      return [{ value: "", label: emptyLabel }, ...list];
    }
    return list;
  }, [filtered, includeEmptyOption, emptyLabel, search]);

  // Fallback unmount in case animationend never fires (jsdom, reduced motion).
  useEffect(() => {
    if (!mounted || open) return;
    const t = setTimeout(() => {
      setMounted(false);
      setSearch("");
      setActiveIndex(0);
    }, 200);
    return () => clearTimeout(t);
  }, [mounted, open]);

  // Close on outside click; focus search and reset highlight on open.
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    searchRef.current?.focus();
    setActiveIndex(0);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Keep the keyboard-highlighted option scrolled into view.
  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  const toggle = () => {
    if (disabled) return;
    if (open) {
      setOpen(false);
    } else {
      setMounted(true);
      setOpen(true);
    }
  };

  const selectItem = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  // After the close animation finishes, unmount and reset transient state.
  const handleAnimationEnd = () => {
    if (!open) {
      setMounted(false);
      setSearch("");
      setActiveIndex(0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) selectItem(item.value);
    }
  };

  const displayDtype = value ? dtypes?.[value] : undefined;

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        id={id}
        name={name}
        data-testid={dataTestId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required}
        onClick={toggle}
        onKeyDown={handleKeyDown}
        className="flex items-center justify-between gap-2 border border-app-border rounded-md px-3 py-2 w-full bg-surface text-left text-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="flex items-center min-w-0">
          <span className={`truncate ${value ? "text-foreground" : "text-muted-foreground"}`}>
            {value || placeholder}
          </span>
          {displayDtype && <DtypeBadge dtype={displayDtype} />}
        </span>
        <svg
          className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {mounted && (
        <div
          data-state={open ? "open" : "closed"}
          onAnimationEnd={handleAnimationEnd}
          className="absolute z-50 mt-1 w-full bg-surface border border-app-border rounded-md shadow-lg origin-top data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fill-mode-forwards data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=open]:slide-in-from-top-2 data-[state=closed]:slide-out-to-top-2"
        >
          <div className="p-2 border-b border-app-border">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
              aria-label="Search columns"
              placeholder="Search columns..."
              className="border border-gray-300 rounded-md w-full px-2 py-1 text-sm bg-surface text-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <ul ref={listRef} role="listbox" className="max-h-48 overflow-y-auto p-1">
            {items.length === 0 && (
              <li className="px-2 py-2 text-sm text-muted-foreground">No columns found</li>
            )}
            {items.map((item, index) => (
              <li
                key={item.value || "__empty__"}
                role="option"
                aria-selected={value === item.value}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectItem(item.value)}
                className={`flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer text-sm ${
                  index === activeIndex ? "bg-surface-hover" : "bg-surface"
                } ${value === item.value ? "font-medium" : ""}`}
              >
                <span className={item.value ? "text-foreground" : "text-muted-foreground italic"}>
                  {item.label}
                </span>
                {item.value && <DtypeBadge dtype={dtypes?.[item.value]} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ColumnSelect;
