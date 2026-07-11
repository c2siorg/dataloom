import { useState, useEffect } from "react";
import Modal from "./Modal";
import Button from "./Button";

export default function InputDialog({
  isOpen,
  message,
  defaultValue = "",
  onSubmit,
  onCancel,
  required = false,
}) {
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
        <p className="mb-3 text-foreground">
          {message} {required && <span className="text-danger">*</span>}
        </p>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={required ? "Required" : ""}
          className="w-full px-3 py-2 border border-app-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent dark:focus:ring-gray-700 dark:focus:border-gray-800 focus:border-accent mb-4"
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
