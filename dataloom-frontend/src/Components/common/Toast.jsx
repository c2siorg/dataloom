import { useEffect } from "react";

const TYPE_CLASSES = {
  success: "bg-green-500",
  error: "bg-red-500",
  info: "bg-blue-500",
  warning: "bg-yellow-500 text-gray-900",
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
    <div className={`px-4 py-3 rounded shadow-lg text-white ${TYPE_CLASSES[type] || TYPE_CLASSES.info}`} role="alert">
      <div className="flex items-center justify-between gap-2">
        <span>{message}</span>
        <button onClick={onDismiss} className="ml-2 text-white hover:text-gray-200" aria-label="Dismiss">&times;</button>
      </div>
    </div>
  );
}
