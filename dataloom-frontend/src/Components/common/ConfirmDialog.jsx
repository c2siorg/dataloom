import Modal from "./Modal";
import Button from "./Button";

/**
 * Confirmation dialog replacing window.confirm().
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether dialog is visible.
 * @param {string} props.message - Confirmation message.
 * @param {Function} props.onConfirm - Callback on confirmation.
 * @param {Function} props.onCancel - Callback on cancellation.
 */
export default function ConfirmDialog({ isOpen, message, onConfirm, onCancel }) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="Confirm">
      <p className="mb-6 text-gray-700">{message}</p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          Confirm
        </Button>
      </div>
    </Modal>
  );
}
