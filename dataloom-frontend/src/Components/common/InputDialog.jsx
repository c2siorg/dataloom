import { useState, useEffect } from "react";
import Modal from "./Modal";
import Button from "./Button";

export default function InputDialog({ isOpen, message, defaultValue = "", onSubmit, onCancel }) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
    }
  }, [isOpen, defaultValue]);

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
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4"
          autoFocus
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">OK</Button>
        </div>
      </form>
    </Modal>
  );
}
