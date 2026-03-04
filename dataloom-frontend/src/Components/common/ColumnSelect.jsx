import PropTypes from "prop-types";

const ColumnSelect = ({ id, label, name, value, onChange, columns, required }) => {
  return (
    <>
      <label htmlFor={id} className="block mb-1 text-sm font-medium text-gray-700">
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        disabled={columns.length === 0}
        className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
        required={required}
      >
        {columns.length === 0 ? (
          <option value="">No columns available — load a dataset first</option>
        ) : (
          <>
            <option value="">Select column…</option>
            {columns.map((columnName) => (
              <option key={columnName} value={columnName}>
                {columnName}
              </option>
            ))}
          </>
        )}
      </select>
    </>
  );
};

ColumnSelect.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  name: PropTypes.string,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  columns: PropTypes.arrayOf(PropTypes.string).isRequired,
  required: PropTypes.bool,
};

ColumnSelect.defaultProps = {
  name: "column",
  required: false,
};

export default ColumnSelect;