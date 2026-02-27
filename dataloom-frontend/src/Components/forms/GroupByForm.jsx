import { useState } from "react";
import PropTypes from "prop-types";
import TransformResultPreview from "./TransformResultPreview";
import { transformProject } from "../../api";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";

const GroupByForm = ({ projectId, onClose }) => {
    const [groupColumns, setGroupColumns] = useState("");
    const [aggColumn, setAggColumn] = useState("");
    const [aggFunc, setAggFunc] = useState("sum");
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const { error, clearError, handleError } = useError();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        clearError();
        try {
            const response = await transformProject(projectId, {
                operation_type: "groupby",
                groupby_query: { group_columns: groupColumns, agg_column: aggColumn, agg_func: aggFunc },
            });
            setResult(response);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 border border-gray-200 rounded-lg bg-white">
            <form onSubmit={handleSubmit}>
                <h3 className="font-semibold text-gray-900 mb-2">GroupBy Aggregation</h3>
                <div className="flex space-x-2 mb-4">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700">Group Columns:</label>
                        <input
                            type="text"
                            value={groupColumns}
                            onChange={(e) => setGroupColumns(e.target.value)}
                            className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                            placeholder="e.g., col1,col2"
                            required
                        />
                    </div>
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700">Aggregation Column:</label>
                        <input
                            type="text"
                            value={aggColumn}
                            onChange={(e) => setAggColumn(e.target.value)}
                            className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                            placeholder="e.g., Sales"
                            required
                        />
                    </div>
                </div>
                <div className="flex space-x-2 mb-4">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700">
                            Aggregation Function:
                        </label>
                        <select
                            value={aggFunc}
                            onChange={(e) => setAggFunc(e.target.value)}
                            className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                        >
                            <option value="sum">Sum</option>
                            <option value="mean">Mean</option>
                            <option value="count">Count</option>
                            <option value="min">Min</option>
                            <option value="max">Max</option>
                            <option value="median">Median</option>
                        </select>
                    </div>
                </div>
                <div className="flex justify-between">
                    <button
                        type="submit"
                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md font-medium transition-colors duration-150"
                        disabled={loading}
                    >
                        {loading ? "Loading..." : "Submit"}
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
            <FormErrorAlert message={error} />
            {result && <TransformResultPreview columns={result.columns} rows={result.rows} />}
        </div>
    );
};

GroupByForm.propTypes = {
    projectId: PropTypes.string.isRequired,
    onClose: PropTypes.func.isRequired,
};

export default GroupByForm;
