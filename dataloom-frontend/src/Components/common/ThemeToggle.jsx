import useTheme from "../../hooks/useTheme";
import { LuSun, LuMoon, LuMonitor } from "react-icons/lu";

const OPTIONS = [
  { value: "light", icon: LuSun, label: "Light" },
  { value: "system", icon: LuMonitor, label: "System" },
  { value: "dark", icon: LuMoon, label: "Dark" },
];

/**
 * Segmented theme toggle button (Light / System / Dark).
 */
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className="flex items-center rounded-lg border border-gray-300 dark:border-dark-border bg-gray-100 dark:bg-dark-bg p-0.5"
      role="radiogroup"
      aria-label="Theme selection"
    >
      {OPTIONS.map(({ value, icon: Icon, label }) => {
        const isActive = theme === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={isActive}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors duration-150 ${
              isActive
                ? "bg-white dark:bg-dark-surface text-gray-900 dark:text-dark-text shadow-sm"
                : "text-gray-500 dark:text-dark-muted hover:text-gray-700 dark:hover:text-dark-text"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
