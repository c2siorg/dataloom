/**
 * Reusable button component with variant support.
 * @param {Object} props
 * @param {'primary'|'secondary'|'danger'|'ghost'} [props.variant='primary'] - Visual style variant.
 * @param {React.ReactNode} props.children - Button content.
 * @param {string} [props.className] - Additional CSS classes.
 * @param {Object} [props.rest] - Additional props passed to the button element.
 */
const VARIANT_CLASSES = {
  primary: "bg-blue-500 hover:bg-blue-600 text-white focus:ring-blue-500",
  secondary:
    "bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-border focus:ring-gray-300",
  danger: "bg-red-500 hover:bg-red-600 text-white focus:ring-red-500",
  ghost:
    "text-gray-500 dark:text-dark-muted hover:text-gray-700 dark:hover:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-border",
};

export default function Button({ variant = "primary", children, className = "", ...rest }) {
  return (
    <button
      className={`px-4 py-2 rounded-md font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-dark-bg ${VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
