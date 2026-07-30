import { LuWorkflow } from "react-icons/lu";
import PipelineStepBuilderPanel from "../../pipelines/PipelineStepBuilderPanel";
import { PipelinesTab, PIPELINES_TAB, STEP_BUILDER_PANEL } from "../PipelinesTab";
import { registerFeature } from "../featureRegistry";

/**
 * Pipelines feature — build a reusable transformation pipeline and manage saved
 * ones. The Pipelines tab is the visual surface (draft assembly from logged +
 * from-scratch steps, plus the saved-pipeline library); the step builder docks in
 * the right panel. The Data ▸ Pipelines menu item opens both at once, mirroring
 * the Charts feature.
 */
registerFeature({
  id: "pipelines",
  tabs: [{ type: "pipelines", component: PipelinesTab }],
  panels: [
    {
      name: STEP_BUILDER_PANEL,
      title: "Add pipeline step",
      component: PipelineStepBuilderPanel,
    },
  ],
  menu: [
    {
      ribbon: "Data",
      group: "Pipeline",
      order: 0,
      label: "Pipelines",
      icon: LuWorkflow,
      action: { openTab: PIPELINES_TAB, openPanel: STEP_BUILDER_PANEL },
      activePanel: STEP_BUILDER_PANEL,
      hover: "Build a reusable pipeline from logged or new steps and reapply it to any project.",
    },
  ],
});
