import { useState } from "react";
import Modal from "./Modal";
import Button from "./Button";

/**
 * Input dialog replacing window.prompt().
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether dialog is visible.
 * @param {string} props.message - Prompt message.
 * @param {string} [props.defaultValue=''] - Default input value.
 * @param {Function} props.onSubmit - Callback with input value.
 * @param {Function} props.onCancel - Callback on cancellation.
 */
export default function InputDialog({ isOpen, message, defaultValue = "", onSubmit, onCancel }) {
  const [value, setValue] = useState(defaultValue);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(value);
  };

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="Input Required">
      <form onSubmit={handleSubmit}>
        <p className="mb-3 text-gray-700">{message}</p>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-purple-500 mb-4"
          autoFocus
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onCancel}>Cancel</Button>
          <Button type="submit">OK</Button>
        </div>
      </form>
    </Modal>
  );
}
