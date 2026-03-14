import { useEffect, useState, useMemo, useRef } from "react";
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    flexRender,
    createColumnHelper,
} from "@tanstack/react-table";
import { transformProject } from "../../api";
import { useProjectContext } from "../../context/ProjectContext";
import { useToast } from "../../context/ToastContext";
import { ArrowUpDown, ArrowUp, ArrowDown, Plus, Trash2, Pencil } from "lucide-react";
import InputDialog from "../common/InputDialog";

const columnHelper = createColumnHelper();

/**
 * Spreadsheet-style table using TanStack Table with inline editing,
 * context menus, and sortable headers.
 */
export default function SpreadsheetTable({ projectId, data: externalData }) {
    const {
        columns: ctxColumns,
        rows: ctxRows,
        dtypes,
        updateData,
    } = useProjectContext();
    const { showToast } = useToast();

    const [tableRows, setTableRows] = useState([]);
    const [colNames, setColNames] = useState([]);
    const [sorting, setSorting] = useState([]);
    const [globalFilter, setGlobalFilter] = useState("");
    const [editingCell, setEditingCell] = useState(null);
    const [editValue, setEditValue] = useState("");
    const [contextMenu, setContextMenu] = useState(null);
    const [inputConfig, setInputConfig] = useState(null);
    const contextMenuRef = useRef(null);

    // Sync data from context
    useEffect(() => {
        if (ctxColumns.length > 0 && ctxRows.length > 0) {
            setColNames(ctxColumns);
            const formatted = ctxRows.map((row, idx) => {
                const obj = { __rowIndex: idx };
                ctxColumns.forEach((col, i) => {
                    obj[col] = row[i];
                });
                return obj;
            });
            setTableRows(formatted);
        }
    }, [ctxColumns, ctxRows]);

    // Sync data from external transforms
    useEffect(() => {
        if (externalData) {
            const { columns, rows } = externalData;
            setColNames(columns);
            const formatted = rows.map((row, idx) => ({
                __rowIndex: idx,
                ...row,
            }));
            setTableRows(formatted);
        }
    }, [externalData]);

    useEffect(() => {
        if (contextMenu && contextMenuRef.current) {
            contextMenuRef.current.style.top = `${contextMenu.y}px`;
            contextMenuRef.current.style.left = `${contextMenu.x}px`;
        }
    }, [contextMenu]);

    const updateTableData = (response) => {
        const { columns, rows, dtypes: newDtypes } = response;
        setColNames(columns);
        const formatted = rows.map((row, idx) => ({
            __rowIndex: idx,
            ...row,
        }));
        setTableRows(formatted);
        updateData(columns, rows, newDtypes);
    };

    // Build TanStack columns
    const columns = useMemo(() => {
        const rowNumCol = columnHelper.display({
            id: "__rowNum",
            header: "#",
            size: 50,
            cell: ({ row }) => (
                <span className="text-surface-500 text-xs font-mono">
                    {row.index + 1}
                </span>
            ),
        });

        const dataCols = colNames.map((colName) =>
            columnHelper.accessor(colName, {
                header: ({ column }) => (
                    <button
                        onClick={column.getToggleSortingHandler()}
                        className="flex items-center gap-1.5 w-full text-left group"
                    >
                        <span className="truncate">{colName}</span>
                        {dtypes[colName] && (
                            <span className="badge bg-surface-700/60 text-surface-400 text-[10px] flex-shrink-0">
                                {dtypes[colName]}
                            </span>
                        )}
                        <span className="ml-auto flex-shrink-0">
                            {column.getIsSorted() === "asc" ? (
                                <ArrowUp className="w-3 h-3 text-brand-400" />
                            ) : column.getIsSorted() === "desc" ? (
                                <ArrowDown className="w-3 h-3 text-brand-400" />
                            ) : (
                                <ArrowUpDown className="w-3 h-3 text-surface-600 group-hover:text-surface-400 transition-colors" />
                            )}
                        </span>
                    </button>
                ),
                cell: ({ row, getValue, column }) => {
                    const rowIdx = row.index;
                    const colIdx = colNames.indexOf(column.id);
                    const isEditing =
                        editingCell?.rowIndex === rowIdx &&
                        editingCell?.colName === column.id;

                    if (isEditing) {
                        return (
                            <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() =>
                                    handleEditCell(rowIdx, colIdx, editValue)
                                }
                                onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                        handleEditCell(rowIdx, colIdx, editValue);
                                    if (e.key === "Escape") {
                                        setEditingCell(null);
                                        setEditValue("");
                                    }
                                }}
                                className="w-full px-1.5 py-0.5 bg-surface-700 border border-brand-400/50 rounded text-xs text-surface-100 focus:outline-none focus:ring-1 focus:ring-brand-400"
                                autoFocus
                            />
                        );
                    }

                    return (
                        <div
                            onClick={() => {
                                setEditingCell({ rowIndex: rowIdx, colName: column.id });
                                setEditValue(String(getValue() ?? ""));
                            }}
                            className="cursor-text px-1 py-0.5 rounded hover:bg-surface-700/40 transition-colors text-xs truncate"
                            title={String(getValue() ?? "")}
                        >
                            {getValue() ?? ""}
                        </div>
                    );
                },
            })
        );

        return [rowNumCol, ...dataCols];
    }, [colNames, dtypes, editingCell, editValue]);

    const table = useReactTable({
        data: tableRows,
        columns,
        state: { sorting, globalFilter },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
    });

    // Cell edit handler
    const handleEditCell = async (rowIndex, cellIndex, newValue) => {
        try {
            const response = await transformProject(projectId, {
                operation_type: "changeCellValue",
                change_cell_value: {
                    col_index: cellIndex,
                    row_index: rowIndex,
                    fill_value: newValue,
                },
            });
            updateTableData(response);
        } catch {
            showToast("Failed to edit cell", "error");
        }
        setEditingCell(null);
        setEditValue("");
    };

    // Context menu actions
    const handleAddRow = async (index) => {
        try {
            const response = await transformProject(projectId, {
                operation_type: "addRow",
                row_params: { index },
            });
            updateTableData(response);
        } catch {
            showToast("Failed to add row", "error");
        }
    };

    const handleDeleteRow = async (index) => {
        try {
            const response = await transformProject(projectId, {
                operation_type: "delRow",
                row_params: { index },
            });
            updateTableData(response);
        } catch {
            showToast("Failed to delete row", "error");
        }
    };

    const handleAddColumn = (index) => {
        setInputConfig({
            message: "Enter column name:",
            onSubmit: async (name) => {
                if (!name) { setInputConfig(null); return; }
                try {
                    const response = await transformProject(projectId, {
                        operation_type: "addCol",
                        col_params: { index, name },
                    });
                    updateTableData(response);
                } catch {
                    showToast("Failed to add column", "error");
                }
                setInputConfig(null);
            },
        });
    };

    const handleDeleteColumn = async (index) => {
        try {
            const response = await transformProject(projectId, {
                operation_type: "delCol",
                col_params: { index },
            });
            updateTableData(response);
        } catch {
            showToast("Failed to delete column", "error");
        }
    };

    const handleRenameColumn = (index) => {
        setInputConfig({
            message: "Enter new column name:",
            onSubmit: async (newName) => {
                if (!newName) { setInputConfig(null); return; }
                try {
                    const response = await transformProject(projectId, {
                        operation_type: "renameCol",
                        rename_col_params: { col_index: index, new_name: newName },
                    });
                    updateTableData(response);
                } catch {
                    showToast("Failed to rename column", "error");
                }
                setInputConfig(null);
            },
        });
    };

    const handleContextMenu = (e, type, index) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            type,
            index,
        });
    };

    return (
        <div
            className="h-full flex flex-col"
            onClick={() => setContextMenu(null)}
        >
            {/* Table toolbar */}
            <div className="flex items-center gap-3 mb-3">
                <input
                    type="text"
                    placeholder="Filter all columns..."
                    value={globalFilter ?? ""}
                    onChange={(e) => setGlobalFilter(e.target.value)}
                    className="input-field max-w-xs text-sm"
                    id="table-global-filter"
                />
                <span className="text-xs text-surface-500">
                    {tableRows.length} rows · {colNames.length} columns
                </span>
            </div>

            {/* Spreadsheet */}
            <div className="flex-1 overflow-auto rounded-xl border border-surface-800/60 bg-surface-900/40">
                <table className="min-w-full">
                    <thead className="sticky top-0 z-10">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map((header, colIdx) => (
                                    <th
                                        key={header.id}
                                        className="px-3 py-2.5 text-xs font-semibold text-surface-400 uppercase tracking-wider bg-surface-800/90 backdrop-blur-sm border-b border-surface-700/50 text-left whitespace-nowrap"
                                        onContextMenu={(e) => {
                                            if (colIdx > 0) {
                                                handleContextMenu(e, "column", colIdx - 1);
                                            }
                                        }}
                                    >
                                        {!header.isPlaceholder &&
                                            flexRender(
                                                header.column.columnDef.header,
                                                header.getContext()
                                            )}
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {table.getRowModel().rows.map((row) => (
                            <tr
                                key={row.id}
                                className="border-b border-surface-800/30 hover:bg-surface-800/30 transition-colors duration-100"
                                onContextMenu={(e) =>
                                    handleContextMenu(e, "row", row.index)
                                }
                            >
                                {row.getVisibleCells().map((cell) => (
                                    <td
                                        key={cell.id}
                                        className="px-3 py-1.5 text-xs text-surface-300"
                                    >
                                        {flexRender(
                                            cell.column.columnDef.cell,
                                            cell.getContext()
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>

                {tableRows.length === 0 && (
                    <div className="flex items-center justify-center h-64 text-surface-500 text-sm">
                        No data loaded. Select a project to view data.
                    </div>
                )}
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div
                    ref={contextMenuRef}
                    className="fixed z-50 bg-surface-800 border border-surface-700/50 rounded-xl shadow-glass p-1.5 min-w-[160px] animate-scale-in"
                >
                    {contextMenu.type === "column" && (
                        <>
                            <button
                                onClick={() => { handleAddColumn(contextMenu.index); setContextMenu(null); }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-surface-300 hover:bg-surface-700/60 rounded-lg transition-colors"
                            >
                                <Plus className="w-4 h-4" /> Add Column
                            </button>
                            <button
                                onClick={() => { handleDeleteColumn(contextMenu.index); setContextMenu(null); }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            >
                                <Trash2 className="w-4 h-4" /> Delete Column
                            </button>
                            <button
                                onClick={() => { handleRenameColumn(contextMenu.index); setContextMenu(null); }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-surface-300 hover:bg-surface-700/60 rounded-lg transition-colors"
                            >
                                <Pencil className="w-4 h-4" /> Rename Column
                            </button>
                        </>
                    )}
                    {contextMenu.type === "row" && (
                        <>
                            <button
                                onClick={() => { handleAddRow(contextMenu.index); setContextMenu(null); }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-surface-300 hover:bg-surface-700/60 rounded-lg transition-colors"
                            >
                                <Plus className="w-4 h-4" /> Add Row
                            </button>
                            <button
                                onClick={() => { handleDeleteRow(contextMenu.index); setContextMenu(null); }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            >
                                <Trash2 className="w-4 h-4" /> Delete Row
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Input Dialog */}
            {inputConfig && (
                <InputDialog
                    isOpen={true}
                    message={inputConfig.message}
                    defaultValue=""
                    onSubmit={inputConfig.onSubmit}
                    onCancel={() => setInputConfig(null)}
                />
            )}
        </div>
    );
}
