import { useEffect } from "react";

const TYPE_CLASSES = {
  success: "border-l-green-500",
  error: "border-l-red-500",
  info: "border-l-blue-500",
  warning: "border-l-yellow-500",
};

/**
 * Single toast notification component.
 * @param {Object} props
 * @param {string} props.message - Toast message text.
 * @param {'success'|'error'|'info'|'warning'} [props.type='info'] - Toast visual type.
 * @param {Function} props.onDismiss - Callback when toast should be removed.
 * @param {number} [props.duration=3000] - Auto-dismiss duration in ms.
 */
export default function Toast({ message, type = "info", onDismiss, duration = 3000 }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [onDismiss, duration]);

  return (
    <div
      className={`bg-white border border-gray-200 border-l-4 rounded-lg shadow-md px-4 py-3 text-gray-900 ${TYPE_CLASSES[type] || TYPE_CLASSES.info}`}
      role="alert"
    >
      <div className="flex items-center justify-between gap-2">
        <span>{message}</span>
        <button onClick={onDismiss} className="ml-2 text-gray-400 hover:text-gray-600 transition-colors duration-150" aria-label="Dismiss">&times;</button>
      </div>
    </div>
  );
}
