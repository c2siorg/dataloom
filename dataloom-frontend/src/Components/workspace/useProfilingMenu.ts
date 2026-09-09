import { useCallback, useMemo } from "react";
import type { IconType } from "react-icons";
import { LuColumns3 } from "react-icons/lu";
import { useWorkspaceTabs } from "../../context/WorkspaceTabsContext";
import { usePanel } from "../../context/PanelContext";
import { useColumnProfilesView } from "../../context/ColumnProfilesContext";
import { DATASET_TAB } from "./DataSetTab";
import { getFeatureMenu } from "./featureRegistry";

/** Ribbon the profiling surfaces are registered under. */
const PROFILING_RIBBON = "Profiling";

/** Where the Column Profiles toggle sits among the registered Profiling items. */
const COLUMN_PROFILES_ORDER = 1;

/** A Profiling action ready to render as a menu entry. */
export interface ProfilingMenuItem {
  /** Stable slug derived from the label, used for test ids. */
  id: string;
  label: string;
  icon: IconType;
  onClick: () => void;
}

const slug = (label: string) => label.toLowerCase().replace(/\s+/g, "-");

/**
 * Show the inline column-profile row, or toggle it when already on the grid.
 *
 * Shared by the ribbon and the tab bar dropdown so the behaviour is defined
 * once. The profiles render inside the DataSet table, so that tab is opened (or
 * refocused) regardless of the toggle state: gating the open on it
 * meant closing the tab while profiles were on left the next click flipping the
 * flag with nothing visible happening, and no obvious way back to the data.
 */
export function useColumnProfilesAction(): () => void {
  const { activeTabId, openTab } = useWorkspaceTabs();
  const { showColumnProfiles, toggleColumnProfiles } = useColumnProfilesView();

  return useCallback(() => {
    const onGrid = activeTabId === DATASET_TAB.id;
    openTab(DATASET_TAB);
    if (onGrid || !showColumnProfiles) toggleColumnProfiles();
  }, [activeTabId, openTab, showColumnProfiles, toggleColumnProfiles]);
}

/**
 * The Profiling menu as clickable items, derived from the feature registry so
 * the tab bar dropdown and the ribbon cannot drift apart — adding a Profiling
 * feature surfaces it in both. Column Profiles is spliced in at its ribbon
 * order because it drives hook state rather than a declarative tab/panel action.
 */
export function useProfilingMenuItems(): ProfilingMenuItem[] {
  const { openTab } = useWorkspaceTabs();
  const { openPanel, togglePanel } = usePanel();
  const toggleColumnProfiles = useColumnProfilesAction();

  return useMemo(() => {
    const registered = getFeatureMenu()
      .filter((item) => item.ribbon === PROFILING_RIBBON)
      .map((item) => ({
        order: item.order,
        id: slug(item.label),
        label: item.label,
        icon: item.icon,
        onClick: () => {
          const { openTab: tab, openPanel: panel, togglePanel: toggle } = item.action;
          if (tab) openTab(tab);
          if (panel) openPanel(panel);
          if (toggle) togglePanel(toggle);
        },
      }));

    return [
      ...registered,
      {
        order: COLUMN_PROFILES_ORDER,
        id: "column-profiles",
        label: "Column Profiles",
        icon: LuColumns3 as IconType,
        onClick: toggleColumnProfiles,
      },
    ]
      .sort((a, b) => a.order - b.order)
      .map((item) => ({ id: item.id, label: item.label, icon: item.icon, onClick: item.onClick }));
  }, [openTab, openPanel, togglePanel, toggleColumnProfiles]);
}
