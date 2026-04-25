import PropTypes from "prop-types";

const DTYPE_STYLES = {
  int: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  float: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  str: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  datetime: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  bool: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
};

const DtypeBadge = ({ dtype }) => {
  if (!dtype) return null;

  const style =
    DTYPE_STYLES[dtype] || "bg-gray-100 text-gray-700 dark:bg-dark-border dark:text-dark-muted";

  return (
    <span className={`ml-1.5 inline-block px-1.5 py-0.5 text-[10px] font-medium rounded ${style}`}>
      {dtype}
    </span>
  );
};

DtypeBadge.propTypes = {
  dtype: PropTypes.string,
};

export default DtypeBadge;
