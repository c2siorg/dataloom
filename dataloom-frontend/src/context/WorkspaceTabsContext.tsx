import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** A single open tab in the workspace tab strip. */
export interface WorkspaceTab {
  /** Stable identifier; opening a tab with an existing id focuses it instead of duplicating. */
  id: string;
  /** Label shown in the tab strip. */
  title: string;
  /** Content kind, resolved to a component via the tab registry (except the built-in "dataset"). */
  type: string;
  /** Whether the tab shows a close (×) button. Defaults to true. */
  closeable?: boolean;
  /** Arbitrary props forwarded to the registered tab component. */
  props?: Record<string, unknown>;
}

interface WorkspaceTabsContextValue {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  activeTab: WorkspaceTab | null;
  openTab: (tab: WorkspaceTab) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
}

const WorkspaceTabsContext = createContext<WorkspaceTabsContextValue | null>(null);

/** Access the workspace tab strip state and actions. Must be used within a WorkspaceTabsProvider. */
// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspaceTabs(): WorkspaceTabsContextValue {
  const context = useContext(WorkspaceTabsContext);
  if (!context) throw new Error("useWorkspaceTabs must be used within a WorkspaceTabsProvider");
  return context;
}

interface WorkspaceTabsProviderProps {
  /** The tabs the workspace starts with (e.g. the pinned DataSet tab). */
  initialTabs: WorkspaceTab[];
  /** Resetting this (e.g. on project navigation) restores the tabs to `initialTabs`. */
  projectId?: string;
  children: ReactNode;
}

/**
 * Holds the in-memory tab strip for a single project workspace. Tabs reset to
 * `initialTabs` whenever `projectId` changes, so navigating between workspaces
 * starts fresh.
 */
export function WorkspaceTabsProvider({
  initialTabs,
  projectId,
  children,
}: WorkspaceTabsProviderProps) {
  const [tabs, setTabs] = useState<WorkspaceTab[]>(initialTabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(initialTabs[0]?.id ?? null);

  // Reset to the initial tabs when the workspace's project changes. Skip the
  // first run so the initial state above isn't clobbered.
  const initialTabsRef = useRef(initialTabs);
  initialTabsRef.current = initialTabs;
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setTabs(initialTabsRef.current);
    setActiveTabId(initialTabsRef.current[0]?.id ?? null);
  }, [projectId]);

  const openTab = useCallback((tab: WorkspaceTab) => {
    setTabs((prev) => (prev.some((t) => t.id === tab.id) ? prev : [...prev, tab]));
    setActiveTabId(tab.id);
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => prev.filter((t) => t.id !== id));
    setActiveTabId((currentActive) => {
      if (currentActive !== id) return currentActive;
      const index = tabs.findIndex((t) => t.id === id);
      const remaining = tabs.filter((t) => t.id !== id);
      // Activate the left neighbour, falling back to the right, else nothing.
      const neighbour = remaining[index - 1] ?? remaining[index] ?? null;
      return neighbour?.id ?? null;
    });
  }, [tabs]);

  const setActiveTab = useCallback((id: string) => {
    setActiveTabId(id);
  }, []);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );

  const value = useMemo<WorkspaceTabsContextValue>(
    () => ({ tabs, activeTabId, activeTab, openTab, closeTab, setActiveTab }),
    [tabs, activeTabId, activeTab, openTab, closeTab, setActiveTab],
  );

  return <WorkspaceTabsContext.Provider value={value}>{children}</WorkspaceTabsContext.Provider>;
}
