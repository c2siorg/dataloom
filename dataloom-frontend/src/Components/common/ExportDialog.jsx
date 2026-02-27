import { useState } from "react";
import PropTypes from "prop-types";
import Modal from "./Modal";
import FormErrorAlert from "./FormErrorAlert";
import useError from "../../hooks/useError";
import { exportCSVWithFormat } from "../../api/projects";

const ExportDialog = ({ isOpen, onClose, projectId }) => {
    const [delimiter, setDelimiter] = useState("comma");
    const [includeHeader, setIncludeHeader] = useState(true);
    const [encoding, setEncoding] = useState("utf-8");
    const [loading, setLoading] = useState(false);
    const { error, clearError, handleError } = useError();

    const delimiterOptions = [
        { value: "comma", label: "Comma (,)", display: "," },
        { value: "tab", label: "Tab (\\t)", display: "\\t" },
        { value: "semicolon", label: "Semicolon (;)", display: ";" },
        { value: "pipe", label: "Pipe (|)", display: "|" }
    ];

    const encodingOptions = [
        { value: "utf-8", label: "UTF-8" },
        { value: "latin-1", label: "Latin-1" },
        { value: "ascii", label: "ASCII" },
        { value: "utf-16", label: "UTF-16" }
    ];

    const handleExport = async () => {
        setLoading(true);
        clearError();

        try {
            await exportCSVWithFormat(projectId, {
                delimiter,
                includeHeader,
                encoding
            });

            // Close dialog on successful export
            onClose();

            // Reset form to defaults
            setDelimiter("comma");
            setIncludeHeader(true);
            setEncoding("utf-8");
        } catch (err) {
            console.error("Export failed:", err);
            handleError(err);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        // Clear any errors when closing
        clearError();
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Export CSV">
            <div className="space-y-6">
                {/* Delimiter Selection */}
                <div>
                    <label className="block mb-2 text-sm font-medium text-gray-700">
                        Delimiter
                    </label>
                    <div className="space-y-2">
                        {delimiterOptions.map((option) => (
                            <label key={option.value} className="flex items-center">
                                <input
                                    type="radio"
                                    name="delimiter"
                                    value={option.value}
                                    checked={delimiter === option.value}
                                    onChange={(e) => setDelimiter(e.target.value)}
                                    className="mr-3 text-blue-600 focus:ring-blue-500 focus:ring-2"
                                />
                                <span className="text-sm text-gray-900">
                                    {option.label}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Include Header Option */}
                <div>
                    <label className="flex items-center">
                        <input
                            type="checkbox"
                            checked={includeHeader}
                            onChange={(e) => setIncludeHeader(e.target.checked)}
                            className="mr-3 text-blue-600 focus:ring-blue-500 focus:ring-2 rounded"
                        />
                        <span className="text-sm font-medium text-gray-700">
                            Include Header Row
                        </span>
                    </label>
                </div>

                {/* Encoding Selection */}
                <div>
                    <label className="block mb-2 text-sm font-medium text-gray-700">
                        Text Encoding
                    </label>
                    <select
                        value={encoding}
                        onChange={(e) => setEncoding(e.target.value)}
                        className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                    >
                        {encodingOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Error Display */}
                <FormErrorAlert message={error} />

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-md font-medium transition-colors duration-150"
                        disabled={loading}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleExport}
                        disabled={loading}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md font-medium transition-colors duration-150 disabled:bg-blue-400 disabled:cursor-not-allowed"
                    >
                        {loading ? "Exporting..." : "Export CSV"}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

ExportDialog.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    projectId: PropTypes.string.isRequired,
};

export default ExportDialog;