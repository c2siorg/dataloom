import Modal from "./Modal";
import Button from "./Button";

interface ConfirmDialogProps {
  /** Whether dialog is visible. */
  isOpen: boolean;
  /** Confirmation message. */
  message: string;
  /** Callback on confirmation. */
  onConfirm: () => void;
  /** Callback on cancellation. */
  onCancel: () => void;
}

/**
 * Confirmation dialog replacing window.confirm().
 */
export default function ConfirmDialog({
  isOpen,
  message,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="Confirm">
      <p className="mb-6 text-foreground">{message}</p>
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
