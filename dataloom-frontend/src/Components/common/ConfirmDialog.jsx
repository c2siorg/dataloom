import PropTypes from "prop-types";
import { AlertTriangle } from "lucide-react";

/**
 * Confirmation dialog with glassmorphism styling.
 */
export default function ConfirmDialog({ isOpen, message, onConfirm, onCancel }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative glass-card max-w-sm w-full p-6 animate-scale-in">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">
              Confirm Action
            </h3>
            <p className="text-sm text-surface-400">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onCancel} className="btn-secondary text-sm">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn-danger text-sm">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

ConfirmDialog.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  message: PropTypes.string,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};
