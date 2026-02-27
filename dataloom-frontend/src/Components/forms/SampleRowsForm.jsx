import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import TransformResultPreview from "./TransformResultPreview";

const SampleRowsForm = ({ projectId, onClose }) => {
    const [sampleSize, setSampleSize] = useState("");
    const [randomSeed, setRandomSeed] = useState("");
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        // Validate sample size
        const size = parseInt(sampleSize, 10);
        if (!sampleSize || isNaN(size) || size <= 0) {
            setError("Sample size must be a positive integer");
            return;
        }

        console.log("Submitting sample with parameters:", {
            sample_size: size,
            random_seed: randomSeed ? parseInt(randomSeed, 10) : null,
        });
        setLoading(true);
        try {
            const params = {
                sample_size: size,
            };
            if (randomSeed) {
                params.random_seed = parseInt(randomSeed, 10);
            }

            const response = await transformProject(projectId, {
                operation_type: "sample",
                sample_rows_params: params,
            });
            setResult(response);
            console.log("Sample API response:", response);
        } catch (err) {
            setError(err.response?.data?.detail || "Error applying sample");
            console.error("Error applying sample:", err.response?.data || err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 border border-gray-200 rounded-lg bg-white">
            <form onSubmit={handleSubmit}>
                <h3 className="font-semibold text-gray-900 mb-2">Sample Rows</h3>
                {error && <div className="mb-4 p-2 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">{error}</div>}
                <div className="flex flex-wrap mb-4">
                    <div className="w-full sm:w-1/2 mb-2">
                        <label className="block mb-1 text-sm font-medium text-gray-700">Sample Size:</label>
                        <input
                            type="number"
                            value={sampleSize}
                            onChange={(e) => setSampleSize(e.target.value)}
                            placeholder="e.g., 100"
                            className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                            required
                        />
                    </div>
                    <div className="w-full sm:w-1/2 mb-2 pl-2">
                        <label className="block mb-1 text-sm font-medium text-gray-700">Random Seed (Optional):</label>
                        <input
                            type="number"
                            value={randomSeed}
                            onChange={(e) => setRandomSeed(e.target.value)}
                            placeholder="e.g., 42"
                            className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                        />
                    </div>
                </div>
                <div className="flex justify-between">
                    <button
                        type="submit"
                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md font-medium transition-colors duration-150"
                        disabled={loading}
                    >
                        Sample Rows
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-md font-medium transition-colors duration-150"
                    >
                        Cancel
                    </button>
                </div>
            </form>
            {result && <TransformResultPreview columns={result.columns} rows={result.rows} />}
        </div>
    );
};

SampleRowsForm.propTypes = {
    projectId: PropTypes.string.isRequired,
    onClose: PropTypes.func.isRequired,
};

export default SampleRowsForm;
