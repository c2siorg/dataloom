import { useState } from "react";
import PropTypes from "prop-types";

/**
 * Input dialog for collecting text input with dark theme.
 */
export default function InputDialog({ isOpen, message, defaultValue = "", onSubmit, onCancel }) {
  const [value, setValue] = useState(defaultValue);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(value);
    setValue("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative glass-card max-w-sm w-full p-6 animate-scale-in">
        <p className="text-sm text-surface-300 mb-4">{message}</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="input-field mb-4"
            autoFocus
            id="input-dialog-field"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setValue("");
                onCancel();
              }}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary text-sm">
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

InputDialog.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  message: PropTypes.string.isRequired,
  defaultValue: PropTypes.string,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};
