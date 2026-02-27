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
        className="bg-white border-b border-gray-200 flex items-center h-14 px-4 md:px-10"
      >
        <div className="text-gray-900 font-semibold text-base flex items-center">
          <Link to="/projects" className="flex items-center gap-2">
            <DataLoomLogo className="w-5 h-5" />
            DataLoom
          </Link>
        </div>
        {isSmall && (
          <div className="text-gray-700 font-medium text-base flex items-center ml-auto mr-4">
            {projectName || "Untitled Project"}
          </div>
        )}
        <div className="ml-auto flex items-center text-gray-500">
          <button className="bg-white border border-gray-300 rounded-md text-gray-700 text-sm py-1.5 px-4 hover:bg-gray-50 transition-colors duration-150">
            Profile
          </button>
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
