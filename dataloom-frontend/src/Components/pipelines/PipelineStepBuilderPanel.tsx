import { useMemo, useState, type ComponentType } from "react";
import type { IconType } from "react-icons";
import { LuArrowLeft } from "react-icons/lu";
import type { CaptureStep, TransformFormProps } from "../forms/transformFormProps";
import { getFeatureMenu, getPanel } from "../workspace/featureRegistry";
import { usePipelineDraft } from "../../context/PipelineDraftContext";
import { useToast } from "../../context/ToastContext";

interface OpEntry {
  label: string;
  icon: IconType;
  component: ComponentType<TransformFormProps>;
}

/** The docked panel name, shared with the tab and the feature registration. */
export const STEP_BUILDER_PANEL = "PipelineStepBuilder";

/**
 * The operations that can be authored from scratch: exactly the Data ▸ Transform
 * ribbon items, read from the feature registry so a new transform appears here
 * the moment it is registered — there is no second list to keep in step.
 */
function transformCatalog(): OpEntry[] {
  return getFeatureMenu()
    .filter((item) => item.ribbon === "Data" && item.group === "Transform")
    .sort((a, b) => a.order - b.order)
    .flatMap((item) => {
      const panel = item.action.togglePanel ? getPanel(item.action.togglePanel) : undefined;
      return panel ? [{ label: item.label, icon: item.icon, component: panel.component }] : [];
    });
}

/**
 * Docked builder for authoring a pipeline step from scratch. Pick an operation and
 * the matching transform form renders in capture mode: filling it in and submitting
 * appends the step to the draft (see PipelineDraftContext) instead of applying it to
 * the current project. Columns come from the current project via the form's own
 * ColumnSelect, so the step is configured against a real schema.
 */
const PipelineStepBuilderPanel = ({ projectId }: { projectId: string }) => {
  const [selected, setSelected] = useState<OpEntry | null>(null);
  const { addStep } = usePipelineDraft();
  const { showToast } = useToast();
  const catalog = useMemo(transformCatalog, []);

  if (selected) {
    const Form = selected.component;
    const backToList = () => setSelected(null);
    const handleCapture = (step: CaptureStep) => {
      addStep({ ...step, source: "manual" });
      showToast(`Added "${selected.label}" step to the draft.`, "success");
      backToList();
    };
    return (
      <div>
        <button
          type="button"
          onClick={backToList}
          className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <LuArrowLeft className="h-4 w-4" />
          All operations
        </button>
        <p className="mb-3 text-sm font-medium text-foreground">{selected.label}</p>
        <Form projectId={projectId} onClose={backToList} onCapture={handleCapture} />
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Pick an operation to add a step. It is configured against this project&apos;s columns and
        added to the draft pipeline.
      </p>
      <ul className="space-y-1">
        {catalog.map((op) => {
          const Icon = op.icon;
          return (
            <li key={op.label}>
              <button
                type="button"
                onClick={() => setSelected(op)}
                className="flex w-full items-center gap-2 rounded-md border border-app-border px-3 py-2 text-left text-sm text-foreground hover:bg-surface-hover"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                {op.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default PipelineStepBuilderPanel;
