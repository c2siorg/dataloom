/**
 * Reusable button component with variant support.
 * @param {Object} props
 * @param {'primary'|'secondary'|'danger'|'ghost'} [props.variant='primary'] - Visual style variant.
 * @param {React.ReactNode} props.children - Button content.
 * @param {string} [props.className] - Additional CSS classes.
 * @param {Object} [props.rest] - Additional props passed to the button element.
 */
const VARIANT_CLASSES = {
  primary: "bg-white hover:bg-gray-100 border border-gray-300 text-gray-900 focus:ring-gray-300",
  secondary: "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-300",
  danger: "bg-red-500 hover:bg-red-600 text-white focus:ring-red-500",
  ghost: "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
};

export default function Button({ variant = "primary", children, className = "", ...rest }) {
  return (
    <button
      className={`px-4 py-2 rounded-md font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 ${VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
