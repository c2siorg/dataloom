import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import TransformResultPreview from "./TransformResultPreview";
import { transformProject, getProjectDetails } from "../../api";

const MeltForm = ({ projectId, onClose }) => {
  const [columns, setColumns] = useState([]);
  const [idVars, setIdVars] = useState([]);
  const [valueVars, setValueVars] = useState([]);
  const [varName, setVarName] = useState("variable");
  const [valueName, setValueName] = useState("value");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProjectDetails = async () => {
      try {
        const data = await getProjectDetails(projectId);
        setColumns(data.columns || []);
      } catch (err) {
        console.error("Error fetching columns:", err);
      }
    };
    fetchProjectDetails();
  }, [projectId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validation: overlap
    if (idVars.length === 0) {
      setError("Please select at least one ID variable.");
      setLoading(false);
      return;
    }

    const effectiveValueVars = valueVars.length > 0
      ? valueVars
      : columns.filter(col => !idVars.includes(col));

    const overlap = idVars.filter(v => effectiveValueVars.includes(v));
    if (overlap.length > 0) {
      setError(`Columns cannot be in both ID and Value variables: ${overlap.join(", ")}`);
      setLoading(false);
      return;
    }

    try {
      const finalVarName = varName.trim() || "variable";
      const finalValueName = valueName.trim() || "value";

      const response = await transformProject(projectId, {
        operation_type: "melt",
        melt_params: {
          id_vars: idVars,
          value_vars: effectiveValueVars,
          var_name: finalVarName,
          value_name: finalValueName
        },
      });
      setResult(response);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleIdVarsChange = (col) => {
    if (idVars.includes(col)) {
      setIdVars(idVars.filter(v => v !== col));
    } else {
      setIdVars([...idVars, col]);
    }
  };

  const handleValueVarsChange = (col) => {
    if (valueVars.includes(col)) {
      setValueVars(valueVars.filter(v => v !== col));
    } else {
      setValueVars([...valueVars, col]);
    }
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      <form onSubmit={handleSubmit} className="space-y-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            Melt (Unpivot) Dataset
        </h3>
        
        {error && (
          <div className="bg-red-50 text-red-600 p-2 rounded text-sm border border-red-100">
            {typeof error === "string" ? error : JSON.stringify(error, null, 2)}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ID Variables (Keep as columns):</label>
            <div className="border border-gray-300 rounded-md max-h-40 overflow-y-auto p-2 bg-gray-50">
              {columns.map(col => (
                <label key={`id-${col}`} className="flex items-center gap-2 py-1 px-1 hover:bg-gray-200 rounded cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={idVars.includes(col)}
                    onChange={() => handleIdVarsChange(col)}
                    className="rounded text-blue-600"
                  />
                  {col}
                </label>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Columns that remain as identifiers.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Value Variables (to unpivot):</label>
            <div className="border border-gray-300 rounded-md max-h-40 overflow-y-auto p-2 bg-gray-50">
              {columns.map(col => (
                <label key={`val-${col}`} className="flex items-center gap-2 py-1 px-1 hover:bg-gray-200 rounded cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={valueVars.includes(col)}
                    onChange={() => handleValueVarsChange(col)}
                    className="rounded text-blue-600"
                  />
                  {col}
                </label>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Leave empty to unpivot all non-ID columns.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Variable Name:</label>
            <input
              type="text"
              value={varName}
              onChange={(e) => setVarName(e.target.value)}
              className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="default: variable"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Value Name:</label>
            <input
              type="text"
              value={valueName}
              onChange={(e) => setValueName(e.target.value)}
              className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="default: value"
            />
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <div className="flex gap-2">
            <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors duration-150 text-sm disabled:opacity-50"
                disabled={loading}
            >
                {loading ? "Processing..." : "Apply Melt"}
            </button>
            <button
                type="button"
                onClick={onClose}
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-md font-medium transition-colors duration-150 text-sm"
            >
                Cancel
            </button>
          </div>
        </div>
      </form>
      {result && (
        <div className="mt-6 border-t border-gray-100 pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Transformation Result Preview
            </h4>
            <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
              {result.row_count} rows generated
            </span>
          </div>
          <TransformResultPreview columns={result.columns} rows={result.rows} />
        </div>
      )}
    </div>
  );
};

MeltForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default MeltForm;
