import { LuLayoutDashboard } from "react-icons/lu";
import { SummaryTab, SUMMARY_TAB } from "../SummaryTab";
import { registerFeature } from "../featureRegistry";

/**
 * Profiling feature — the dataset Summary tab and its Profiling-ribbon menu item.
 * The "Column Profiles" toggle stays a core MenuNavbar item (it drives table state
 * via a hook, not a declarative tab/panel action).
 */
registerFeature({
  id: "profiling",
  tabs: [{ type: "summary", component: SummaryTab }],
  menu: [
    {
      ribbon: "Profiling",
      group: "Profiling",
      order: 0,
      label: "Summary",
      icon: LuLayoutDashboard,
      action: { openTab: SUMMARY_TAB },
      hover: "View a summary of the dataset.",
    },
  ],
});
