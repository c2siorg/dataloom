import PropTypes from 'prop-types';
import { useProjectContext } from '../../context/ProjectContext';

/**
 * A <select> dropdown populated with the current project's column names.
 * Reads columns from ProjectContext — no extra API call needed.
 */
const ColumnSelect = ({ name, value, onChange, required = true, placeholder = 'Select column...' }) => {
  const { columns } = useProjectContext();

  return (
    <select
      name={name}
      value={value}
      onChange={onChange}
      required={required}
      className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white
                 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                 focus:outline-none"
    >
      <option value="" disabled>{placeholder}</option>
      {columns.map((col) => (
        <option key={col} value={col}>{col}</option>
      ))}
    </select>
  );
};

ColumnSelect.propTypes = {
  name: PropTypes.string,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  required: PropTypes.bool,
  placeholder: PropTypes.string,
};

export default ColumnSelect;
