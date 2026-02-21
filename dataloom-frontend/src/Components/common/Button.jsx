/**
 * Reusable button component with variant support.
 * @param {Object} props
 * @param {'primary'|'secondary'|'danger'} [props.variant='primary'] - Visual style variant.
 * @param {React.ReactNode} props.children - Button content.
 * @param {string} [props.className] - Additional CSS classes.
 * @param {Object} [props.rest] - Additional props passed to the button element.
 */
const VARIANT_CLASSES = {
  primary: "bg-purple-600 hover:bg-purple-700 text-white",
  secondary: "bg-gray-200 hover:bg-gray-300 text-gray-800",
  danger: "bg-red-600 hover:bg-red-700 text-white",
};

export default function Button({ variant = "primary", children, className = "", ...rest }) {
  return (
    <button
      className={`px-4 py-2 rounded font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
