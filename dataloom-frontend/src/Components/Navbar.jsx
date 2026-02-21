import { Link, useLocation } from "react-router-dom";
import { useProjectContext } from "../context/ProjectContext";
import DataLoomLogo from "./common/DataLoomLogo";

const Navbar = () => {
  const location = useLocation();
  const { projectName } = useProjectContext();
  const isSmall = location.pathname.startsWith("/workspace/");

  return (
    <header role="banner">
      <nav
        aria-label="Main navigation"
        className={`bg-white border-b border-gray-200 flex p-4 transition-all duration-300 ${
          isSmall ? "h-12" : "h-16"
        }`}
      >
        <div
          className={`text-gray-900 font-semibold ${
            isSmall ? "text-base" : "text-lg"
          } flex items-center ml-4 md:ml-10`}
        >
          <Link to="/projects" className="flex items-center gap-2">
            <DataLoomLogo className={isSmall ? "w-5 h-5" : "w-6 h-6"} />
            DataLoom
          </Link>
        </div>
        {isSmall && (
          <div
            className={`text-gray-700 font-medium ${
              isSmall ? "text-base" : "text-lg"
            } flex items-center ml-auto mr-4`}
          >
            {projectName || "Untitled Project"}
          </div>
        )}
        <div className="ml-auto text-gray-500 items-end">
          <button
            className={`bg-white border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors duration-150 ${
              isSmall ? "py-1 px-3 text-sm" : "py-2 px-4"
            }`}
          >
            Profile
          </button>
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
