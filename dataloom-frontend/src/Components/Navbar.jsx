import { Link, useLocation } from "react-router-dom";
import { useProjectContext } from "../context/ProjectContext";
import DataLoomLogo from "./common/DataLoomLogo";

const Navbar = () => {
  const location = useLocation();
  const { projectName } = useProjectContext();
  const isSmall = location.pathname.startsWith("/workspace/");

  return (
    <header role="banner" className="sticky top-0 z-50">
      <nav
        aria-label="Main navigation"
        className={`glass border-b border-slate-200/50 flex items-center px-6 transition-all duration-300 ${isSmall ? "h-14" : "h-16"
          }`}
      >
        <div
          className={`text-slate-900 font-bold tracking-tight ${isSmall ? "text-lg" : "text-xl"
            } flex items-center`}
        >
          <Link to="/projects" className="flex items-center gap-2.5 group">
            <div className="bg-accent/10 p-1.5 rounded-lg group-hover:bg-accent/20 transition-colors duration-200">
              <DataLoomLogo className={isSmall ? "w-5 h-5" : "w-6 h-6"} />
            </div>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-accent to-indigo-600">
              DataLoom
            </span>
          </Link>
        </div>
        {isSmall && (
          <div
            className={`text-slate-600 font-medium ${isSmall ? "text-sm" : "text-base"
              } flex items-center ml-8 pl-8 border-l border-slate-200`}
          >
            {projectName || "Untitled Project"}
          </div>
        )}
        <div className="ml-auto flex items-center gap-4">
          <button className="btn-secondary !py-1.5 !px-4 !text-sm">
            Docs
          </button>
          <button
            className={`btn-primary !py-1.5 !px-4 !text-sm ${isSmall ? "" : ""
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
