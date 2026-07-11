import { useEffect, useMemo, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

/**
 * Generic styled dropdown. A trigger button opens an animated popover with a
 * keyboard-navigable list of options. Shares the look and motion of ColumnSelect
 * but takes a plain {value,label}[] list — used for the app's short, curated
 * dropdowns (aggregation functions, sort order, target types, etc.).
 */
const Select = ({
  value,
  onChange,
  options,
  placeholder = "Select...",
  id,
  disabled = false,
  className = "",
  "data-testid": dataTestId,
}: SelectProps) => {
  const [open, setOpen] = useState(false);
  // Kept mounted while the close animation plays, then unmounted on animationend.
  const [mounted, setMounted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedLabel = useMemo(
    () => options.find((opt) => opt.value === value)?.label,
    [options, value],
  );

  // Fallback unmount in case animationend never fires (jsdom, reduced motion).
  useEffect(() => {
    if (!mounted || open) return;
    const t = setTimeout(() => {
      setMounted(false);
      setActiveIndex(0);
    }, 200);
    return () => clearTimeout(t);
  }, [mounted, open]);

  // Close on outside click; highlight the current value on open.
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    const current = options.findIndex((opt) => opt.value === value);
    setActiveIndex(current >= 0 ? current : 0);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, options, value]);

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
      setActiveIndex(0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = options[activeIndex];
      if (item) selectItem(item.value);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className || "w-full"}`}>
      <button
        type="button"
        id={id}
        data-testid={dataTestId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={handleKeyDown}
        className="flex items-center justify-between gap-2 border border-app-border rounded-md px-3 py-2 w-full bg-surface text-left text-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span
          className={`truncate ${selectedLabel ? "text-foreground" : "text-secondary-foreground"}`}
        >
          {selectedLabel || placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-secondary-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
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
          <ul ref={listRef} role="listbox" className="max-h-48 overflow-y-auto p-1">
            {options.map((item, index) => (
              <li
                key={item.value}
                role="option"
                aria-selected={value === item.value}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectItem(item.value)}
                className={`px-2 py-1.5 rounded cursor-pointer text-sm ${
                  index === activeIndex
                    ? "bg-gray-200 dark:bg-surface"
                    : "hover:bg-gray-100 dark:hover:bg-surface-hover"
                } ${value === item.value ? "font-medium" : ""}`}
              >
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default Select;
