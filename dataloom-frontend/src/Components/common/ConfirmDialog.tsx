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
  /** Disable confirmation while the requested action is pending. */
  confirmDisabled?: boolean;
  /** Optional label shown on the confirmation button. */
  confirmLabel?: string;
}

/**
 * Confirmation dialog replacing window.confirm().
 */
export default function ConfirmDialog({
  isOpen,
  message,
  onConfirm,
  onCancel,
  confirmDisabled = false,
  confirmLabel = "Confirm",
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="Confirm">
      <p className="mb-6 text-foreground">{message}</p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={confirmDisabled}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
