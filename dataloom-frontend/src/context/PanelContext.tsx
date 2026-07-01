import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface PanelContextValue {
  /** Name of the open side panel (e.g. "FilterForm", "Logs"), or null if none. */
  activePanel: string | null;
  openPanel: (name: string) => void;
  closePanel: () => void;
  /** Open the named panel, or close it if it is already the active one. */
  togglePanel: (name: string) => void;
}

const PanelContext = createContext<PanelContextValue | null>(null);

/** Access the workspace side-panel state. Must be used within a PanelProvider. */
// eslint-disable-next-line react-refresh/only-export-components
export function usePanel(): PanelContextValue {
  const context = useContext(PanelContext);
  if (!context) throw new Error("usePanel must be used within a PanelProvider");
  return context;
}

/** Tracks which side panel (transform form, Logs, Checkpoints) is open in the workspace. */
export function PanelProvider({ children }: { children: ReactNode }) {
  const [activePanel, setActivePanel] = useState<string | null>(null);

  const openPanel = useCallback((name: string) => setActivePanel(name), []);
  const closePanel = useCallback(() => setActivePanel(null), []);
  const togglePanel = useCallback(
    (name: string) => setActivePanel((current) => (current === name ? null : name)),
    [],
  );

  const value = useMemo<PanelContextValue>(
    () => ({ activePanel, openPanel, closePanel, togglePanel }),
    [activePanel, openPanel, closePanel, togglePanel],
  );

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}
