import PropTypes from "prop-types";
import { useProjectContext } from "../../context/ProjectContext";

/**
 * Reusable column dropdown selector that pulls columns from ProjectContext.
 * Replaces free-text column inputs across all transform forms.
 */
const ColumnSelect = ({
  value,
  onChange,
  label = "Column",
  name = "column",
  required = true,
  placeholder = "Select column...",
  allowMultiple = false,
}) => {
  const { columns } = useProjectContext();

  if (allowMultiple) {
    return (
      <div>
        <label className="block mb-1 text-sm font-medium text-gray-700">{label}:</label>
        <select
          multiple
          value={
            value
              ? value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : []
          }
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions, (o) => o.value);
            onChange({ target: { name, value: selected.join(",") } });
          }}
          className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none min-h-[80px]"
          required={required}
        >
          {columns.map((col) => (
            <option key={col} value={col}>
              {col}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-400">Hold Ctrl/Cmd to select multiple</span>
      </div>
    );
  }

  return (
    <div>
      <label className="block mb-1 text-sm font-medium text-gray-700">{label}:</label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
        required={required}
      >
        <option value="">{placeholder}</option>
        {columns.map((col) => (
          <option key={col} value={col}>
            {col}
          </option>
        ))}
      </select>
    </div>
  );
};

ColumnSelect.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string,
  name: PropTypes.string,
  required: PropTypes.bool,
  placeholder: PropTypes.string,
  allowMultiple: PropTypes.bool,
};

export default ColumnSelect;
