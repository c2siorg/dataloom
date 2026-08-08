import { LuFileText } from "react-icons/lu";
import ReportConfigPanel from "../../report/ReportConfigPanel";
import { ReportTab, REPORT_TAB } from "../ReportTab";
import { registerFeature } from "../featureRegistry";

/**
 * Report feature — the downloadable PDF. The preview lives in the Report tab;
 * section choices dock in the right side panel. The File ▸ Report menu item
 * opens both at once, mirroring Charts and Quality: the button configures a
 * report rather than firing a silent download. State is bridged by
 * ReportViewContext (provided in DataScreen).
 */
registerFeature({
  id: "report",
  tabs: [{ type: "report", component: ReportTab }],
  panels: [
    // Pinned: the Report tab opens this panel and closes it again, because the
    // preview is not usable without the section choices and Download beside it.
    { name: "ReportConfig", title: "Report", component: ReportConfigPanel, pinned: true },
  ],
  menu: [
    {
      ribbon: "File",
      group: "Save",
      order: 2,
      label: "Report",
      icon: LuFileText,
      action: { openTab: REPORT_TAB, openPanel: "ReportConfig" },
      activePanel: "ReportConfig",
      disabledInPreview: true,
      hover: "Build a PDF report of this project and download it.",
    },
  ],
});
