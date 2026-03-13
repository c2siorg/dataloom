import { useState } from "react";
import PropTypes from "prop-types";
import { exportProject, downloadQualityReport } from "../api";

const ExportPanel = ({ projectId, onClose }) => {
  const [format, setFormat] = useState("csv");
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await exportProject(projectId, format);
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = format;
      a.download = `export.${ext}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setExporting(false);
    }
  };

  const handleQualityReport = async () => {
    setExporting(true);
    try {
      const response = await downloadQualityReport(projectId);
      const blob = new Blob([response.data], { type: "text/html" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "quality_report.html";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Report error:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-gray-900">Export Data</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Format:</label>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
        >
          <option value="csv">CSV (.csv)</option>
          <option value="xlsx">Excel (.xlsx)</option>
          <option value="json">JSON (.json)</option>
          <option value="parquet">Parquet (.parquet)</option>
          <option value="tsv">TSV (.tsv)</option>
        </select>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md font-medium transition-colors duration-150 flex-1"
        >
          {exporting ? "Exporting..." : "Export Data"}
        </button>
        <button
          onClick={handleQualityReport}
          disabled={exporting}
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md font-medium transition-colors duration-150 flex-1"
        >
          Quality Report
        </button>
      </div>
    </div>
  );
};

ExportPanel.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default ExportPanel;
