import { useState, useEffect, useCallback } from "react";
import { NavLink, Outlet, Link } from "react-router-dom";
import {
  UserRound,
  SlidersHorizontal,
  FolderOpen,
  Settings,
  ArrowLeft,
  Search,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { getRecentProjects, searchProjects } from "../../api";
import type { Project } from "./types";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/settings/account", label: "Account", icon: UserRound },
  { to: "/settings/preferences", label: "Preferences", icon: SlidersHorizontal },
];

export default function SettingsPage() {
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchResults, setSearchResults] = useState<Project[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const response = await getRecentProjects();
      setProjects(response);
    } catch (error) {
      console.error("Error fetching projects:", error);
    }
  }, []);

  useEffect(() => {
    if (projectsOpen) fetchProjects();
  }, [projectsOpen, fetchProjects]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setIsSearchLoading(false);
      return;
    }
    const timeoutId = setTimeout(async () => {
      try {
        setIsSearchLoading(true);
        const response = await searchProjects(query);
        setSearchResults(response as Project[]);
      } catch (error) {
        console.error("Error searching projects:", error);
        setSearchResults([]);
      } finally {
        setIsSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const isSearching = searchQuery.trim().length > 0;
  const visibleProjects = isSearching ? searchResults : projects;

  return (
    <div className="flex min-h-full bg-slate-50">
      <aside className="w-56 shrink-0 border-r border-gray-200 bg-white px-3 py-6 flex flex-col">
        <div className="mb-6 flex items-center gap-2 px-3">
          <Settings className="h-5 w-5 text-gray-700" />
          <span className="text-sm font-semibold text-gray-900">Settings</span>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-600"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}

          <button
            type="button"
            onClick={() => setProjectsOpen((prev) => !prev)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors w-full text-left"
          >
            <FolderOpen className="h-4 w-4 shrink-0" />
            <span className="flex-1">Projects</span>
            {projectsOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            )}
          </button>

          {projectsOpen && (
            <div className="ml-2 mt-1 flex flex-col gap-1">
              <div className="relative px-1 mb-1">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search projects..."
                  className="w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-2 text-xs text-gray-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                />
              </div>

              {isSearchLoading ? (
                <p className="px-3 py-1 text-xs text-gray-400">Searching...</p>
              ) : visibleProjects.length === 0 ? (
                <p className="px-3 py-1 text-xs text-gray-400">
                  {isSearching ? "No projects found" : "No projects yet"}
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto flex flex-col gap-0.5">
                  {visibleProjects.map((project) => (
                    <NavLink
                      key={project.project_id}
                      to={`/settings/projects/${project.project_id}`}
                      className={({ isActive }) =>
                        `truncate rounded-lg px-3 py-2 flex items-center text-xs font-medium transition-colors ${
                          isActive
                            ? "bg-blue-50 text-blue-600"
                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        }`
                      }
                    >
                      {project.name}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="mt-auto pt-6 px-3">
          <Link
            to="/projects"
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto px-8 py-10">
        <Outlet />
      </main>
    </div>
  );
}
