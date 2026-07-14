import { LuShieldCheck } from "react-icons/lu";
import QualityConfigPanel from "../../quality/QualityConfigPanel";
import { QualityTab, QUALITY_TAB } from "../QualityTab";
import { registerFeature } from "../featureRegistry";

/**
 * Quality feature — data quality assessment. The scored report lives in the
 * Quality tab; detector configuration (outlier method, pattern rules) docks in
 * the right side panel. The Profiling ▸ Quality menu item opens both at once,
 * mirroring the Charts feature. Report state is bridged by QualityViewContext
 * (provided in DataScreen).
 */
registerFeature({
  id: "quality",
  tabs: [{ type: "quality", component: QualityTab }],
  panels: [{ name: "QualityConfig", title: "Quality Assessment", component: QualityConfigPanel }],
  menu: [
    {
      ribbon: "Profiling",
      group: "Profiling",
      order: 3,
      label: "Quality",
      icon: LuShieldCheck,
      action: { openTab: QUALITY_TAB, openPanel: "QualityConfig" },
      activePanel: "QualityConfig",
      hover: "Assess data quality: duplicates, missing values, outliers, and more.",
    },
  ],
});
