import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useProjectContext } from "../context/ProjectContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { ROUTES } from "../constants/routes";
import { renameProject } from "../api/projects";
import DataLoomLogo from "./common/DataLoomLogo";
import { LuCircleUserRound, LuCheck, LuX, LuLogOut } from "react-icons/lu";

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId, projectName, setProjectInfo } = useProjectContext();
  const { user, logout } = useAuth();
  const { showToast } = useToast();

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const isWorkspacePage = location.pathname.startsWith("/workspace/");
  const displayProjectName = projectName || "Untitled Project";

  const handleStartEdit = () => {
    setEditedName(projectName || "");
    setIsEditingName(true);
  };

  const handleCancelEdit = () => {
    setEditedName(projectName || "");
    setIsEditingName(false);
  };

  const handleSaveName = async () => {
    const trimmed = editedName.trim();

    if (!trimmed) {
      showToast("Project name cannot be empty.", "error");
      return;
    }

    if (!projectId) {
      showToast("Project not found.", "error");
      return;
    }

    if (trimmed === projectName) {
      setIsEditingName(false);
      return;
    }

    setSavingName(true);

    try {
      await renameProject(projectId, trimmed);
      setProjectInfo(projectId, trimmed);
      setIsEditingName(false);
      showToast("Project renamed successfully.", "success");
    } catch (error) {
      console.error("Failed to rename project:", error);
      showToast("Failed to rename project.", "error");
    } finally {
      setSavingName(false);
    }
  };

  const handleNameKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSaveName();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      handleCancelEdit();
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate(ROUTES.signin);
    }
  };

  return (
    <header role="banner">
      <nav
        aria-label="Main navigation"
        className="flex h-14 items-center border-b border-gray-200 bg-white px-3 sm:px-4 md:px-10"
      >
        <div className="flex shrink-0 items-center font-semibold text-gray-900">
          <Link to="/projects" className="flex items-center gap-2">
            <DataLoomLogo className="h-5 w-5 shrink-0" />
            <span className="text-base font-semibold">DataLoom</span>
          </Link>
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
          {isWorkspacePage &&
            (isEditingName ? (
              <div className="flex min-w-0 items-center gap-1">
                <input
                  type="text"
                  value={editedName}
                  onChange={(event) => setEditedName(event.target.value)}
                  onKeyDown={handleNameKeyDown}
                  className="h-9 w-[86px] min-w-0 rounded-md border border-gray-300 px-2 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-56 md:w-80"
                  autoFocus
                  disabled={savingName}
                  aria-label="Project name"
                />

                <button
                  type="button"
                  onClick={handleSaveName}
                  disabled={savingName}
                  className="flex shrink-0 p-1 items-center justify-center rounded-md text-green-600 transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Save project name"
                >
                  <LuCheck className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={savingName}
                  className="flex shrink-0 p-1 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Cancel rename"
                >
                  <LuX className="h-4 w-4 text-red-500" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleStartEdit}
                className="min-w-0 max-w-[92px] truncate rounded-md px-1.5 py-1 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 sm:max-w-[220px] sm:text-base md:max-w-md"
                title={`${displayProjectName} — click to rename`}
                aria-label="Rename project"
              >
                {displayProjectName}
              </button>
            ))}

          {user && (
            <Link to={ROUTES.profile} className="shrink-0">
              <div
                title="Profile"
                aria-label="Profile"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
              >
                <LuCircleUserRound className="h-5 w-5" />
              </div>
            </Link>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 sm:w-auto sm:px-4 sm:text-sm"
            aria-label="Sign out"
          >
            <LuLogOut className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
