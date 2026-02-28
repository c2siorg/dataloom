import PropTypes from "prop-types";

const DTYPE_STYLES = {
  int: "bg-blue-100 text-blue-700",
  float: "bg-teal-100 text-teal-700",
  str: "bg-green-100 text-green-700",
  datetime: "bg-purple-100 text-purple-700",
  bool: "bg-orange-100 text-orange-700",
};

const DtypeBadge = ({ dtype }) => {
  if (!dtype) return null;

  const style = DTYPE_STYLES[dtype] || "bg-gray-100 text-gray-700";

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
