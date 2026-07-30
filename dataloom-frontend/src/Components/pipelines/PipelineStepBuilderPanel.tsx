import { useState, type ComponentType } from "react";
import type { IconType } from "react-icons";
import {
  LuArrowLeft,
  LuArrowUpDown,
  LuCode,
  LuCopyMinus,
  LuDice5,
  LuEraser,
  LuFilter,
  LuGroup,
  LuLayoutList,
  LuRefreshCw,
  LuReplace,
  LuScissors,
  LuSigma,
  LuTable2,
} from "react-icons/lu";
import AdvQueryFilterForm from "../forms/AdvQueryFilterForm";
import CastDataTypeForm from "../forms/CastDataTypeForm";
import DropDuplicateForm from "../forms/DropDuplicateForm";
import FillEmptyForm from "../forms/FillEmptyForm";
import FilterForm from "../forms/FilterForm";
import FormulaColumnForm from "../forms/FormulaColumnForm";
import GroupByForm from "../forms/GroupByForm";
import MeltForm from "../forms/MeltForm";
import PivotTableForm from "../forms/PivotTableForm";
import SampleRowsForm from "../forms/SampleRowsForm";
import SortForm from "../forms/SortForm";
import StringReplaceForm from "../forms/StringReplaceForm";
import TrimWhitespaceForm from "../forms/TrimWhitespaceForm";
import type { CaptureStep, TransformFormProps } from "../forms/transformFormProps";
import { usePipelineDraft } from "../../context/PipelineDraftContext";
import { useToast } from "../../context/ToastContext";

interface OpEntry {
  label: string;
  icon: IconType;
  component: ComponentType<TransformFormProps>;
}

// The operations that can be authored from scratch — the same transform forms the
// Data ribbon exposes, reused here in capture mode.
const CATALOG: OpEntry[] = [
  { label: "Filter", icon: LuFilter, component: FilterForm },
  { label: "Sample", icon: LuDice5, component: SampleRowsForm },
  { label: "Sort", icon: LuArrowUpDown, component: SortForm },
  { label: "Drop Duplicates", icon: LuCopyMinus, component: DropDuplicateForm },
  { label: "Group By", icon: LuGroup, component: GroupByForm },
  { label: "Cast Type", icon: LuRefreshCw, component: CastDataTypeForm },
  { label: "Trim Whitespace", icon: LuScissors, component: TrimWhitespaceForm },
  { label: "Replace", icon: LuReplace, component: StringReplaceForm },
  { label: "Fill Empty", icon: LuEraser, component: FillEmptyForm },
  { label: "Advanced Query", icon: LuCode, component: AdvQueryFilterForm },
  { label: "Pivot Table", icon: LuTable2, component: PivotTableForm },
  { label: "Melt (Unpivot)", icon: LuLayoutList, component: MeltForm },
  { label: "Formula Column", icon: LuSigma, component: FormulaColumnForm },
];

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
        {CATALOG.map((op) => {
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
