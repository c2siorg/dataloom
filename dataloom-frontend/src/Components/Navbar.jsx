import { Link, useLocation } from "react-router-dom";
import { useProjectContext } from "../context/ProjectContext";
import { useTheme } from "../context/useTheme";
import DataLoomLogo from "./common/DataLoomLogo";

const Navbar = () => {
  const location = useLocation();
  const { projectName } = useProjectContext();
  const { isDark, toggleTheme } = useTheme();
  const isWorkspacePage = location.pathname.startsWith("/workspace/");
  const displayProjectName = projectName || "Untitled Project";

  return (
    <header role="banner">
      <nav
        aria-label="Main navigation"
        className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center h-14 px-4 md:px-10"
      >
        <div className="text-gray-900 dark:text-gray-100 font-semibold flex items-center">
          <Link to="/projects" className="flex items-center gap-2">
            <DataLoomLogo className="w-5 h-5" />
            <span className="text-base">DataLoom</span>
          </Link>
        </div>
        <div className="ml-auto flex items-center gap-2 min-w-0">
          {isWorkspacePage && (
            <div
              className="text-gray-700 dark:text-gray-300 font-medium text-base min-w-0 max-w-[50vw] md:max-w-md mr-2 truncate"
              title={displayProjectName}
            >
              {displayProjectName}
            </div>
          )}
          <button
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200 text-sm py-1.5 px-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150"
          >
            {isDark ? "☀️ Light" : "🌙 Dark"}
          </button>
          <button
            type="button"
            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200 text-sm py-1.5 px-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150"
          >
            Profile
          </button>
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
