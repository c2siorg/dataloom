/**
 * Reusable button component with variant and size support.
 * @param {Object} props
 * @param {'primary'|'secondary'|'danger'|'ghost'|'success'} [props.variant='primary'] - Visual style variant.
 * @param {'sm'|'md'} [props.size='md'] - Button size.
 * @param {React.ReactNode} props.children - Button content.
 * @param {string} [props.className] - Additional CSS classes.
 * @param {Object} [props.rest] - Additional props passed to the button element.
 */
const VARIANT_CLASSES = {
  primary: "bg-blue-500 hover:bg-blue-600 text-white focus:ring-blue-500",
  secondary: "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-300",
  danger: "bg-red-500 hover:bg-red-600 text-white focus:ring-red-500",
  ghost: "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
  success: "bg-green-600 hover:bg-green-700 text-white focus:ring-green-600",
};

const SIZE_CLASSES = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2",
};

export default function Button({
  variant = "primary",
  size = "md",
  children,
  className = "",
  ...rest
}) {
  return (
    <button
      className={`rounded-md font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        SIZE_CLASSES[size] || SIZE_CLASSES.md
      } ${VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
