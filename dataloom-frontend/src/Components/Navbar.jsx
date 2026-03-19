import { Link, useLocation } from "react-router-dom";
import { useProjectContext } from "../context/ProjectContext";
import DataLoomLogo from "./common/DataLoomLogo";

const Navbar = () => {
  const location = useLocation();
  const { projectName } = useProjectContext();
  const isWorkspacePage = location.pathname.startsWith("/workspace/");
  const displayProjectName = projectName || "Untitled Project";

  return (
    <header role="banner">
      <nav
        aria-label="Main navigation"
        className="bg-white border-b border-gray-200 flex items-center h-14 px-4 md:px-10"
      >
        <div className="text-gray-900 font-semibold flex items-center">
          <Link to="/projects" className="flex items-center gap-2">
            <DataLoomLogo className="w-5 h-5" />
            <span className="text-base">DataLoom</span>
          </Link>
        </div>
        <div className="ml-auto flex items-center gap-2 min-w-0">
          {isWorkspacePage && (
            <div
              className="text-gray-700 font-medium text-base min-w-0 max-w-[50vw] md:max-w-md mr-2 truncate"
              title={displayProjectName}
            >
              {displayProjectName}
            </div>
          )}
          <button
            type="button"
            className="bg-white border border-gray-300 rounded-md text-gray-700 text-sm py-1.5 px-4 hover:bg-gray-50 transition-colors duration-150"
          >
            Profile
          </button>
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
