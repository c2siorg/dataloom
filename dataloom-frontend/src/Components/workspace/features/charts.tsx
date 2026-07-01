import { LuChartColumnBig } from "react-icons/lu";
import ChartBuilderPanel from "../../visualizations/ChartBuilderPanel";
import { ChartsTab, CHARTS_TAB } from "../ChartsTab";
import { registerFeature } from "../featureRegistry";

/**
 * Charts feature — data visualization. The rendered charts live in the Charts
 * tab; the no-code builder docks in the right side panel. The Profiling ▸ Charts
 * menu item opens both at once (openTab + openPanel). Chart/heatmap state is
 * bridged between the two by ChartViewContext (provided in DataScreen).
 */
registerFeature({
  id: "charts",
  tabs: [{ type: "charts", component: ChartsTab }],
  panels: [{ name: "ChartBuilder", title: "Chart Builder", component: ChartBuilderPanel }],
  menu: [
    {
      ribbon: "Profiling",
      group: "Profiling",
      order: 2,
      label: "Charts",
      icon: LuChartColumnBig,
      action: { openTab: CHARTS_TAB, openPanel: "ChartBuilder" },
    },
  ],
});
