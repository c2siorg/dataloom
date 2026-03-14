import { useState } from "react";
import { transformProject } from "../../api";
import { useProjectContext } from "../../context/ProjectContext";
import { useToast } from "../../context/ToastContext";
import {
    Filter,
    ArrowUpDown,
    CopyMinus,
    Code,
    Table2,
    RefreshCw,
    Scissors,
    Eraser,
    Play,
    X,
    ChevronDown,
    ChevronUp,
} from "lucide-react";

/**
 * Transformation Builder — card-based UI for building and applying data transformations.
 */

const transformTypes = [
    {
        key: "filter",
        label: "Filter",
        icon: Filter,
        desc: "Filter rows by column condition",
        color: "text-gray-300",
        bg: "bg-gray-500/10",
        fields: ["column", "condition", "value"],
    },
    {
        key: "sort",
        label: "Sort",
        icon: ArrowUpDown,
        desc: "Sort rows by column",
        color: "text-emerald-400",
        bg: "bg-emerald-500/10",
        fields: ["column", "ascending"],
    },
    {
        key: "dropDuplicate",
        label: "Drop Duplicates",
        icon: CopyMinus,
        desc: "Remove duplicate rows",
        color: "text-amber-400",
        bg: "bg-amber-500/10",
        fields: ["columns"],
    },
    {
        key: "castDataType",
        label: "Cast Type",
        icon: RefreshCw,
        desc: "Change column data types",
        color: "text-violet-400",
        bg: "bg-violet-500/10",
        fields: ["column", "target_type"],
    },
    {
        key: "trimWhitespace",
        label: "Trim Whitespace",
        icon: Scissors,
        desc: "Remove leading/trailing spaces",
        color: "text-rose-400",
        bg: "bg-rose-500/10",
        fields: ["columns"],
    },
    {
        key: "fillEmpty",
        label: "Fill Empty",
        icon: Eraser,
        desc: "Fill missing values",
        color: "text-gray-300",
        bg: "bg-gray-500/10",
        fields: ["column", "fill_value", "strategy"],
    },
    {
        key: "advQueryFilter",
        label: "Advanced Query",
        icon: Code,
        desc: "Pandas-style query filter",
        color: "text-orange-400",
        bg: "bg-orange-500/10",
        fields: ["query"],
    },
    {
        key: "pivotTables",
        label: "Pivot Table",
        icon: Table2,
        desc: "Create pivot table",
        color: "text-pink-400",
        bg: "bg-pink-500/10",
        fields: ["index", "columns_field", "values", "aggfunc"],
    },
];

const conditionOptions = [
    "==", "!=", ">", "<", ">=", "<=", "contains", "startswith", "endswith",
];

const dataTypes = ["int64", "float64", "str", "datetime64", "bool"];
const fillStrategies = ["value", "mean", "median", "mode", "ffill", "bfill"];
const aggFunctions = ["mean", "sum", "count", "min", "max", "first", "last"];

export default function TransformationBuilder({ projectId, onTransform }) {
    const { columns } = useProjectContext();
    const { showToast } = useToast();
    const [selectedTransform, setSelectedTransform] = useState(null);
    const [formValues, setFormValues] = useState({});
    const [isExecuting, setIsExecuting] = useState(false);
    const [expandedCard, setExpandedCard] = useState(null);

    const handleSelectTransform = (key) => {
        if (expandedCard === key) {
            setExpandedCard(null);
            setSelectedTransform(null);
            setFormValues({});
        } else {
            setExpandedCard(key);
            setSelectedTransform(key);
            setFormValues({});
        }
    };

    const handleFieldChange = (field, value) => {
        setFormValues((prev) => ({ ...prev, [field]: value }));
    };

    const handleExecute = async () => {
        if (!selectedTransform) return;
        setIsExecuting(true);

        try {
            let payload = {};

            switch (selectedTransform) {
                case "filter":
                    payload = {
                        operation_type: "filter",
                        filter_params: {
                            column: formValues.column,
                            condition: formValues.condition,
                            value: formValues.value,
                        },
                    };
                    break;
                case "sort":
                    payload = {
                        operation_type: "sort",
                        sort_params: {
                            column: formValues.column,
                            ascending: formValues.ascending !== "false",
                        },
                    };
                    break;
                case "dropDuplicate":
                    payload = {
                        operation_type: "dropDuplicate",
                        drop_duplicate_params: {
                            columns: formValues.columns ? formValues.columns.split(",").map(s => s.trim()) : [],
                        },
                    };
                    break;
                case "castDataType":
                    payload = {
                        operation_type: "castDataType",
                        cast_data_type_params: {
                            column: formValues.column,
                            target_type: formValues.target_type,
                        },
                    };
                    break;
                case "trimWhitespace":
                    payload = {
                        operation_type: "trimWhitespace",
                        trim_whitespace_params: {
                            columns: formValues.columns ? formValues.columns.split(",").map(s => s.trim()) : [],
                        },
                    };
                    break;
                case "fillEmpty":
                    payload = {
                        operation_type: "fillEmpty",
                        fill_empty_params: {
                            column: formValues.column,
                            fill_value: formValues.fill_value || null,
                            strategy: formValues.strategy || "value",
                        },
                    };
                    break;
                case "advQueryFilter":
                    payload = {
                        operation_type: "advQueryFilter",
                        adv_query_filter_params: { query: formValues.query },
                    };
                    break;
                case "pivotTables":
                    payload = {
                        operation_type: "pivotTables",
                        pivot_table_params: {
                            index: formValues.index,
                            columns: formValues.columns_field,
                            values: formValues.values,
                            aggfunc: formValues.aggfunc || "mean",
                        },
                    };
                    break;
            }

            const response = await transformProject(projectId, payload);
            onTransform(response);
            showToast("Transformation applied successfully!", "success");
        } catch (err) {
            showToast("Transformation failed. Check your parameters.", "error");
        } finally {
            setIsExecuting(false);
        }
    };

    const renderFormField = (field) => {
        switch (field) {
            case "column":
            case "index":
            case "columns_field":
            case "values":
                return (
                    <div key={field}>
                        <label className="block text-xs font-medium text-surface-400 mb-1.5 capitalize">
                            {field.replace(/_/g, " ")}
                        </label>
                        <select
                            value={formValues[field] || ""}
                            onChange={(e) => handleFieldChange(field, e.target.value)}
                            className="input-field text-sm"
                        >
                            <option value="">Select column</option>
                            {columns.map((col) => (
                                <option key={col} value={col}>{col}</option>
                            ))}
                        </select>
                    </div>
                );
            case "condition":
                return (
                    <div key={field}>
                        <label className="block text-xs font-medium text-surface-400 mb-1.5">
                            Condition
                        </label>
                        <select
                            value={formValues.condition || ""}
                            onChange={(e) => handleFieldChange("condition", e.target.value)}
                            className="input-field text-sm"
                        >
                            <option value="">Select condition</option>
                            {conditionOptions.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>
                );
            case "target_type":
                return (
                    <div key={field}>
                        <label className="block text-xs font-medium text-surface-400 mb-1.5">
                            Target Type
                        </label>
                        <select
                            value={formValues.target_type || ""}
                            onChange={(e) => handleFieldChange("target_type", e.target.value)}
                            className="input-field text-sm"
                        >
                            <option value="">Select type</option>
                            {dataTypes.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>
                );
            case "strategy":
                return (
                    <div key={field}>
                        <label className="block text-xs font-medium text-surface-400 mb-1.5">
                            Strategy
                        </label>
                        <select
                            value={formValues.strategy || ""}
                            onChange={(e) => handleFieldChange("strategy", e.target.value)}
                            className="input-field text-sm"
                        >
                            {fillStrategies.map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                );
            case "aggfunc":
                return (
                    <div key={field}>
                        <label className="block text-xs font-medium text-surface-400 mb-1.5">
                            Aggregate Function
                        </label>
                        <select
                            value={formValues.aggfunc || "mean"}
                            onChange={(e) => handleFieldChange("aggfunc", e.target.value)}
                            className="input-field text-sm"
                        >
                            {aggFunctions.map((f) => (
                                <option key={f} value={f}>{f}</option>
                            ))}
                        </select>
                    </div>
                );
            case "ascending":
                return (
                    <div key={field}>
                        <label className="block text-xs font-medium text-surface-400 mb-1.5">
                            Order
                        </label>
                        <select
                            value={formValues.ascending ?? "true"}
                            onChange={(e) => handleFieldChange("ascending", e.target.value)}
                            className="input-field text-sm"
                        >
                            <option value="true">Ascending</option>
                            <option value="false">Descending</option>
                        </select>
                    </div>
                );
            case "columns":
                return (
                    <div key={field}>
                        <label className="block text-xs font-medium text-surface-400 mb-1.5">
                            Columns (comma-separated)
                        </label>
                        <input
                            type="text"
                            value={formValues.columns || ""}
                            onChange={(e) => handleFieldChange("columns", e.target.value)}
                            placeholder="col1, col2, col3"
                            className="input-field text-sm"
                        />
                    </div>
                );
            default:
                return (
                    <div key={field}>
                        <label className="block text-xs font-medium text-surface-400 mb-1.5 capitalize">
                            {field.replace(/_/g, " ")}
                        </label>
                        <input
                            type="text"
                            value={formValues[field] || ""}
                            onChange={(e) => handleFieldChange(field, e.target.value)}
                            placeholder={`Enter ${field.replace(/_/g, " ")}`}
                            className="input-field text-sm"
                        />
                    </div>
                );
        }
    };

    return (
        <div className="h-full overflow-auto">
            <div className="max-w-3xl mx-auto space-y-3">
                <div className="mb-4">
                    <h2 className="text-lg font-semibold text-white">
                        Transformation Builder
                    </h2>
                    <p className="text-sm text-surface-400 mt-1">
                        Select an operation and configure parameters to transform your data
                    </p>
                </div>

                {transformTypes.map((t) => (
                    <div
                        key={t.key}
                        className={`glass-card overflow-hidden transition-all duration-300 ${expandedCard === t.key
                                ? "border-brand-500/40 shadow-glow"
                                : ""
                            }`}
                    >
                        <button
                            onClick={() => handleSelectTransform(t.key)}
                            className="w-full flex items-center gap-4 p-4 hover:bg-surface-800/40 transition-colors"
                            id={`transform-${t.key}`}
                        >
                            <div className={`w-10 h-10 rounded-xl ${t.bg} flex items-center justify-center flex-shrink-0`}>
                                <t.icon className={`w-5 h-5 ${t.color}`} />
                            </div>
                            <div className="flex-1 text-left min-w-0">
                                <h3 className="text-sm font-semibold text-surface-200">
                                    {t.label}
                                </h3>
                                <p className="text-xs text-surface-500 mt-0.5">{t.desc}</p>
                            </div>
                            {expandedCard === t.key ? (
                                <ChevronUp className="w-4 h-4 text-surface-400 flex-shrink-0" />
                            ) : (
                                <ChevronDown className="w-4 h-4 text-surface-400 flex-shrink-0" />
                            )}
                        </button>

                        {/* Expanded form */}
                        {expandedCard === t.key && (
                            <div className="px-4 pb-4 border-t border-surface-800/40 animate-fade-in">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                                    {t.fields.map((field) => renderFormField(field))}
                                </div>
                                <div className="flex justify-end gap-2 mt-4">
                                    <button
                                        onClick={() => {
                                            setExpandedCard(null);
                                            setSelectedTransform(null);
                                            setFormValues({});
                                        }}
                                        className="btn-ghost flex items-center gap-1 text-sm"
                                    >
                                        <X className="w-4 h-4" /> Cancel
                                    </button>
                                    <button
                                        onClick={handleExecute}
                                        disabled={isExecuting}
                                        className="btn-primary flex items-center gap-2 text-sm"
                                        id={`transform-execute-${t.key}`}
                                    >
                                        {isExecuting ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                Applying...
                                            </>
                                        ) : (
                                            <>
                                                <Play className="w-4 h-4" />
                                                Apply
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
