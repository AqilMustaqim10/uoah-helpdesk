// A small "Are you sure?" window.
import Button from "./Button";
import Modal from "./Modal";

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  /** Red confirm button for actions that are hard to undo. */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal label={title} onClose={onClose} size="md">
      <div className="space-y-5 p-6">
        <div className="pr-10">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{message}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={onConfirm}
            className={danger ? "bg-rose-600 hover:bg-rose-600" : undefined}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
