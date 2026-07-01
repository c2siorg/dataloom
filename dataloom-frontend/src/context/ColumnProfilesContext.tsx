import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface ColumnProfilesContextValue {
  /** Whether the DataSet table shows the inline per-column profile row. */
  showColumnProfiles: boolean;
  toggleColumnProfiles: () => void;
}

const ColumnProfilesContext = createContext<ColumnProfilesContextValue | null>(null);

/**
 * Access the column-profiles view toggle. Shared between the Profiling menu
 * (which flips it) and the DataSet tab (which renders profiles when on), since
 * the two live in different subtrees of the workspace.
 *
 * Distinct from the `useColumnProfiles` data-fetching hook — this only holds the
 * show/hide flag. Must be used within a ColumnProfilesProvider.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useColumnProfilesView(): ColumnProfilesContextValue {
  const context = useContext(ColumnProfilesContext);
  if (!context)
    throw new Error("useColumnProfilesView must be used within a ColumnProfilesProvider");
  return context;
}

/** Holds whether the DataSet table shows its inline column-profile row. */
export function ColumnProfilesProvider({ children }: { children: ReactNode }) {
  const [showColumnProfiles, setShowColumnProfiles] = useState(false);
  const toggleColumnProfiles = useCallback(() => setShowColumnProfiles((v) => !v), []);

  const value = useMemo<ColumnProfilesContextValue>(
    () => ({ showColumnProfiles, toggleColumnProfiles }),
    [showColumnProfiles, toggleColumnProfiles],
  );

  return <ColumnProfilesContext.Provider value={value}>{children}</ColumnProfilesContext.Provider>;
}
