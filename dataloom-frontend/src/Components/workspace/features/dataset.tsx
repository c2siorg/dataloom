import { DATASET_TAB, DataSetTab } from "../DataSetTab";
import { registerFeature } from "../featureRegistry";

/**
 * DataSet feature — the built-in working-table tab. It has no ribbon menu item;
 * it opens with the workspace and is reopened (or refocused) by the Column
 * Profiles action, from either the Profiling ribbon or the tab bar "+" menu,
 * since the profiles render inside this table. Re-exported here so DataScreen
 * imports one feature module per feature.
 */
registerFeature({
  id: "dataset",
  tabs: [{ type: "dataset", component: DataSetTab }],
});

export { DATASET_TAB };
