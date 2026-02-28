import { useState } from "react";
import Modal from "../common/Modal";
import { exportProject } from "../../api";
import proptype from "prop-types";

const DELIMITERS = [
  { value: "comma", label: "Comma (,)" },
  { value: "tab", label: "Tab (\\t)" },
  { value: "semicolon", label: "Semicolon (;)" },
  { value: "pipe", label: "Pipe (|)" },
];

const ENCODINGS = [
  { value: "utf-8", label: "UTF-8" },
  { value: "latin-1", label: "Latin-1" },
  { value: "ascii", label: "ASCII" },
  { value: "utf-16", label: "UTF-16" },
];

/**
 * Dialog for configuring and triggering a CSV export.
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the dialog is visible.
 * @param {Function} props.onClose - Callback to close the dialog.
 * @param {string} props.projectId - The project ID to export.
 * @param {string} props.projectName - The project name used as the download filename.
 */
const ExportDialog = ({ isOpen, onClose, projectId, projectName }) => {
  const [delimiter, setDelimiter] = useState("comma");
  const [includeHeader, setIncludeHeader] = useState(true);
  const [encoding, setEncoding] = useState("utf-8");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    try {
      const blob = await exportProject(projectId, {
        delimiter,
        include_header: includeHeader,
        encoding,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName || "export"}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      setError("Failed to export. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export CSV">
      <div className="flex flex-col gap-5">

        {/* Delimiter */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Delimiter</label>
          <select
            value={delimiter}
            onChange={(e) => setDelimiter(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {DELIMITERS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        {/* Encoding */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Encoding</label>
          <select
            value={encoding}
            onChange={(e) => setEncoding(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {ENCODINGS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </div>

        {/* Include Header */}
        <div className="flex items-center gap-3">
          <input
            id="include-header"
            type="checkbox"
            checked={includeHeader}
            onChange={(e) => setIncludeHeader(e.target.checked)}
            className="w-4 h-4 accent-blue-600 cursor-pointer"
          />
          <label htmlFor="include-header" className="text-sm font-medium text-gray-700 cursor-pointer">
            Include header row
          </label>
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {loading ? "Exporting…" : "Export"}
          </button>
        </div>

      </div>
    </Modal>
  );
};

ExportDialog.propTypes = {
  isOpen: proptype.bool.isRequired,
  onClose: proptype.func.isRequired,
  projectId: proptype.string.isRequired,
  projectName: proptype.string,
};

export default ExportDialog;
