import { useEffect } from "react";
import PropTypes from "prop-types";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";

const typeConfig = {
  success: {
    icon: CheckCircle2,
    bg: "bg-emerald-500/10 border-emerald-500/30",
    iconColor: "text-emerald-400",
    textColor: "text-emerald-200",
  },
  error: {
    icon: XCircle,
    bg: "bg-red-500/10 border-red-500/30",
    iconColor: "text-red-400",
    textColor: "text-red-200",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-amber-500/10 border-amber-500/30",
    iconColor: "text-amber-400",
    textColor: "text-amber-200",
  },
  info: {
    icon: Info,
    bg: "bg-gray-500/10 border-gray-500/30",
    iconColor: "text-gray-300",
    textColor: "text-gray-200",
  },
};

/**
 * Toast notification component with auto-dismiss.
 */
export default function Toast({ message, type = "info", onDismiss, duration = 4000 }) {
  const config = typeConfig[type] || typeConfig.info;
  const Icon = config.icon;

  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [onDismiss, duration]);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-glass animate-slide-in-right ${config.bg}`}
    >
      <Icon className={`w-5 h-5 flex-shrink-0 ${config.iconColor}`} />
      <p className={`text-sm font-medium flex-1 ${config.textColor}`}>
        {message}
      </p>
      <button
        onClick={onDismiss}
        className="text-surface-400 hover:text-surface-200 transition-colors p-0.5"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

Toast.propTypes = {
  message: PropTypes.string.isRequired,
  type: PropTypes.oneOf(["success", "error", "warning", "info"]),
  onDismiss: PropTypes.func.isRequired,
  duration: PropTypes.number,
};
