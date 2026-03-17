import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { listPipelines, runPipeline, savePipeline } from "../api";
import { useProjectContext } from "../context/ProjectContext";
import FormErrorAlert from "./common/FormErrorAlert";
import useError from "../hooks/useError";

const STEP_TYPES = [
  { value: "filter", label: "Filter" },
  { value: "sort", label: "Sort" },
  { value: "fillEmpty", label: "Fill Empty" },
  { value: "dropDuplicate", label: "Drop Duplicates" },
  { value: "formula", label: "Formula Column" },
];

const StepEditor = ({ step, index, columns, onChange, onRemove }) => {
  const updateField = (path, value) => {
    const updated = JSON.parse(JSON.stringify(step));
    const keys = path.split(".");
    let obj = updated;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    onChange(index, updated);
  };

  return (
    <div className="border border-gray-200 rounded p-3 mb-2 bg-gray-50">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-medium text-gray-500">Step {index + 1}</span>
        <button onClick={() => onRemove(index)} className="text-xs text-red-500 hover:text-red-700">
          Remove
        </button>
      </div>
      <select
        value={step.operation_type || ""}
        onChange={(e) => onChange(index, { operation_type: e.target.value })}
        className="border border-gray-300 rounded px-2 py-1 text-sm w-full mb-2 bg-white"
      >
        <option value="">Select operation...</option>
        {STEP_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      {step.operation_type === "filter" && (
        <div className="flex gap-2">
          <select
            value={step.parameters?.column || ""}
            onChange={(e) => updateField("parameters.column", e.target.value)}
            className="border rounded px-2 py-1 text-sm flex-1 bg-white"
          >
            <option value="">Column</option>
            {columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={step.parameters?.condition || "="}
            onChange={(e) => updateField("parameters.condition", e.target.value)}
            className="border rounded px-2 py-1 text-sm w-16 bg-white"
          >
            <option value="=">=</option>
            <option value="!=">!=</option>
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
          </select>
          <input
            value={step.parameters?.value || ""}
            onChange={(e) => updateField("parameters.value", e.target.value)}
            placeholder="Value"
            className="border rounded px-2 py-1 text-sm flex-1"
          />
        </div>
      )}

      {step.operation_type === "sort" && (
        <div className="flex gap-2">
          <select
            value={step.sort_params?.column || ""}
            onChange={(e) => updateField("sort_params.column", e.target.value)}
            className="border rounded px-2 py-1 text-sm flex-1 bg-white"
          >
            <option value="">Column</option>
            {columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={step.sort_params?.ascending ?? true}
            onChange={(e) => updateField("sort_params.ascending", e.target.value === "true")}
            className="border rounded px-2 py-1 text-sm bg-white"
          >
            <option value="true">Ascending</option>
            <option value="false">Descending</option>
          </select>
        </div>
      )}

      {step.operation_type === "fillEmpty" && (
        <div className="flex gap-2">
          <select
            value={step.fill_empty_params?.index ?? ""}
            onChange={(e) =>
              updateField(
                "fill_empty_params.index",
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
            className="border rounded px-2 py-1 text-sm flex-1 bg-white"
          >
            <option value="">All columns</option>
            {columns.map((c, i) => (
              <option key={c} value={i}>
                {c}
              </option>
            ))}
          </select>
          <input
            value={step.fill_empty_params?.fill_value || ""}
            onChange={(e) => updateField("fill_empty_params.fill_value", e.target.value)}
            placeholder="Fill value"
            className="border rounded px-2 py-1 text-sm flex-1"
          />
        </div>
      )}

      {step.operation_type === "dropDuplicate" && (
        <div className="flex gap-2">
          <input
            value={step.drop_duplicate?.columns || ""}
            onChange={(e) => updateField("drop_duplicate.columns", e.target.value)}
            placeholder="Columns (comma-separated)"
            className="border rounded px-2 py-1 text-sm flex-1"
          />
          <select
            value={step.drop_duplicate?.keep || "first"}
            onChange={(e) => updateField("drop_duplicate.keep", e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-white"
          >
            <option value="first">Keep First</option>
            <option value="last">Keep Last</option>
          </select>
        </div>
      )}

      {step.operation_type === "formula" && (
        <div className="flex gap-2">
          <input
            value={step.formula?.name || ""}
            onChange={(e) => updateField("formula.name", e.target.value)}
            placeholder="Column name"
            className="border rounded px-2 py-1 text-sm flex-1"
          />
          <input
            value={step.formula?.expression || ""}
            onChange={(e) => updateField("formula.expression", e.target.value)}
            placeholder="Expression (e.g. col1 + col2)"
            className="border rounded px-2 py-1 text-sm flex-1"
          />
        </div>
      )}
    </div>
  );
};

StepEditor.propTypes = {
  step: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
  columns: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
};

const PipelinePanel = ({ projectId, onClose, onTransform }) => {
  const { columns } = useProjectContext();
  const [pipelines, setPipelines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [steps, setSteps] = useState([]);
  const [saving, setSaving] = useState(false);
  const { error, clearError, handleError } = useError();

  useEffect(() => {
    fetchPipelines();
  }, []);

  const fetchPipelines = async () => {
    setLoading(true);
    try {
      setPipelines(await listPipelines());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleRun = async (pipelineId) => {
    setRunning(pipelineId);
    clearError();
    try {
      const result = await runPipeline(projectId, pipelineId);
      onTransform(result);
      onClose();
    } catch (err) {
      handleError(err);
    } finally {
      setRunning(null);
    }
  };

  const handleStepChange = (index, updated) => {
    const copy = [...steps];
    copy[index] = updated;
    setSteps(copy);
  };

  const handleRemoveStep = (index) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const handleSavePipeline = async () => {
    if (!newName.trim() || steps.length === 0) return;
    setSaving(true);
    clearError();
    try {
      await savePipeline({ name: newName, description: newDesc || null, steps });
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      setSteps([]);
      await fetchPipelines();
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white max-h-[500px] overflow-y-auto">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-gray-900">Transformation Pipelines</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="text-xs bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded"
          >
            {showCreate ? "Cancel" : "+ New Pipeline"}
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">
            &times;
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="mb-4 border border-blue-200 rounded p-3 bg-blue-50">
          <div className="flex gap-2 mb-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Pipeline name"
              className="border rounded px-2 py-1 text-sm flex-1"
              required
            />
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              className="border rounded px-2 py-1 text-sm flex-1"
            />
          </div>
          {steps.map((step, i) => (
            <StepEditor
              key={i}
              step={step}
              index={i}
              columns={columns}
              onChange={handleStepChange}
              onRemove={handleRemoveStep}
            />
          ))}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setSteps([...steps, { operation_type: "" }])}
              className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded"
            >
              + Add Step
            </button>
            <button
              onClick={handleSavePipeline}
              disabled={saving || !newName.trim() || steps.length === 0}
              className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Pipeline"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading pipelines...</p>
      ) : pipelines.length === 0 && !showCreate ? (
        <p className="text-gray-500 text-sm">
          No saved pipelines yet. Click &quot;+ New Pipeline&quot; to create one.
        </p>
      ) : (
        <div className="space-y-2">
          {pipelines.map((p) => (
            <div key={p.id} className="flex items-center justify-between bg-gray-50 p-3 rounded">
              <div>
                <div className="font-medium text-gray-900 text-sm">{p.name}</div>
                {p.description && <div className="text-xs text-gray-500">{p.description}</div>}
                <div className="text-xs text-gray-400">{p.steps.length} steps</div>
              </div>
              <button
                onClick={() => handleRun(p.id)}
                disabled={running === p.id}
                className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded transition-colors"
              >
                {running === p.id ? "Running..." : "Run"}
              </button>
            </div>
          ))}
        </div>
      )}
      <FormErrorAlert message={error} />
    </div>
  );
};

PipelinePanel.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func.isRequired,
};

export default PipelinePanel;
