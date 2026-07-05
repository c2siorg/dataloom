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
import { getProjects, searchProjects } from "../../api/projects";
import { ROUTES } from "../../constants/routes";
import type { Project } from "./types";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PAGE_SIZE = 50;

const NAV_ITEMS: NavItem[] = [
  { to: ROUTES.settingsAccount, label: "Account", icon: UserRound },
  { to: ROUTES.settingsPreferences, label: "Preferences", icon: SlidersHorizontal },
];

export default function SettingsPage() {
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchResults, setSearchResults] = useState<Project[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isProjectsLoading, setIsProjectsLoading] = useState(false);
  const [hasMoreProjects, setHasMoreProjects] = useState(true);

  const fetchProjects = useCallback(async (offset = 0) => {
    try {
      setIsProjectsLoading(true);
      const response = (await getProjects({ limit: PAGE_SIZE, offset })) as Project[];

      setProjects((prev) => (offset === 0 ? response : [...prev, ...response]));
      setHasMoreProjects(response.length === PAGE_SIZE);
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setIsProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (projectsOpen && projects.length === 0) {
      fetchProjects();
    }
  }, [projectsOpen, projects.length, fetchProjects]);

  useEffect(() => {
    const query = searchQuery.trim();

    if (!query) {
      setSearchResults([]);
      setIsSearchLoading(false);
      return;
    }

    let cancelled = false;

    const timeoutId = setTimeout(async () => {
      try {
        setIsSearchLoading(true);
        const response = await searchProjects(query);
        if (!cancelled) setSearchResults(response as Project[]);
      } catch (error) {
        if (!cancelled) {
          console.error("Error searching projects:", error);
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) setIsSearchLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
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

              {isSearchLoading || (isProjectsLoading && visibleProjects.length === 0) ? (
                <p className="px-3 py-1 text-xs text-gray-400">
                  {isSearching ? "Searching..." : "Loading projects..."}
                </p>
              ) : visibleProjects.length === 0 ? (
                <p className="px-3 py-1 text-xs text-gray-400">
                  {isSearching ? "No projects found" : "No projects yet"}
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto flex flex-col gap-0.5">
                  {visibleProjects.map((project) => (
                    <NavLink
                      key={project.project_id}
                      to={ROUTES.settingsProject(project.project_id)}
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

                  {!isSearching && hasMoreProjects && (
                    <button
                      type="button"
                      onClick={() => fetchProjects(projects.length)}
                      disabled={isProjectsLoading}
                      className="rounded-lg px-3 py-2 text-left text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-60"
                    >
                      {isProjectsLoading ? "Loading..." : "Load more projects"}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="mt-auto pt-6 px-3">
          <Link
            to={ROUTES.home}
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
