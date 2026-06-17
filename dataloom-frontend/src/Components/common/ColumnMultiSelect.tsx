import { useMemo, useState } from "react";
import { useProjectContext } from "../../context/ProjectContext";
import DtypeBadge from "./DtypeBadge";

interface ColumnMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  /** Override the column list; defaults to the project's columns. */
  options?: string[];
  required?: boolean;
  name?: string;
  "data-testid"?: string;
}

/**
 * Searchable, dtype-aware multi-column picker. A search box filters a scrollable
 * checkbox list; each row shows the column's data-type badge. Reads columns/dtypes
 * from ProjectContext and emits the toggled array of column names.
 */
const ColumnMultiSelect = ({
  value,
  onChange,
  options,
  required = false,
  name,
  "data-testid": dataTestId,
}: ColumnMultiSelectProps) => {
  const { columns, dtypes } = useProjectContext();
  const cols = options ?? columns;

  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => cols.filter((col) => col.toLowerCase().includes(search.toLowerCase())),
    [cols, search],
  );

  const toggle = (col: string) => {
    onChange(value.includes(col) ? value.filter((c) => c !== col) : [...value, col]);
  };

  return (
    <div data-testid={dataTestId}>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search columns..."
        aria-label="Search columns"
        aria-required={required}
        className="border border-gray-300 rounded-md w-full px-3 py-2 mb-1 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
      />
      <div className="border border-gray-300 rounded-md max-h-40 overflow-y-auto p-2 bg-gray-50">
        {filtered.length === 0 && <p className="px-1 py-1 text-sm text-gray-400">No columns found</p>}
        {filtered.map((col) => (
          <label
            key={col}
            className="flex items-center gap-2 py-1 px-1 hover:bg-gray-200 rounded cursor-pointer text-sm"
          >
            <input
              type="checkbox"
              name={name}
              checked={value.includes(col)}
              onChange={() => toggle(col)}
              className="rounded text-blue-600"
            />
            <span className="text-gray-900">{col}</span>
            <DtypeBadge dtype={dtypes?.[col]} />
          </label>
        ))}
      </div>
      {value.length > 0 && (
        <p className="text-[10px] text-gray-400 mt-1">{value.length} selected</p>
      )}
    </div>
  );
};

export default ColumnMultiSelect;
