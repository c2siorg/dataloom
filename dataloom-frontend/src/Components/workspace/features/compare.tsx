import { MdCompare } from "react-icons/md";
import { registerFeature } from "../featureRegistry";
import { CompareTab, COMPARE_TAB } from "../CompareTab";

registerFeature({
  id: "compare",
  tabs: [{ type: "compare", component: CompareTab }],
  menu: [
    {
      ribbon: "Profiling",
      group: "Profiling",
      order: 3,
      label: "Compare",
      icon: MdCompare,
      action: { openTab: COMPARE_TAB },
      hover: "Compare datasets side-by-side.",
    },
  ],
});
