import { DATASET_TAB, DataSetTab } from "../DataSetTab";
import { registerFeature } from "../featureRegistry";

/**
 * DataSet feature — the built-in working-table tab. It has no ribbon menu item;
 * it's opened by the tab bar "+" and focused by the Profiling column-profiles
 * toggle. Re-exported here so DataScreen imports one feature module per feature.
 */
registerFeature({
  id: "dataset",
  tabs: [{ type: "dataset", component: DataSetTab }],
});

export { DATASET_TAB };
