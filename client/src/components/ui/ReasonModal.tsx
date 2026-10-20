// A window that asks "Are you sure?" AND requires a written reason before a permanent deletion.
// The reason (at least 5 characters) is sent to the server and recorded in the audit log.
import { useState, type FormEvent } from "react";
import { Loader2, Trash2 } from "lucide-react";
import Button from "./Button";
import FormError from "./FormError";
import Modal from "./Modal";
import Textarea from "./Textarea";

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  /** An error from the server, shown above the buttons. */
  error?: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

export default function ReasonModal({
  title,
  message,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
}: Props) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const trimmed = reason.trim();
  const tooShort = trimmed.length < 5;

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (tooShort || busy) return;
    onConfirm(trimmed);
  }

  return (
    <Modal label={title} onClose={onClose} size="md">
      <form onSubmit={submit} className="space-y-4 p-6" noValidate>
        <div className="pr-10">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{message}</p>
        </div>

        <Textarea
          label="Reason for deleting (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          autoFocus
          placeholder="For example: duplicate ticket, created by mistake, requested by the owner"
          hint="This is saved in the audit log."
          error={
            touched && tooShort
              ? "Please write a reason of at least 5 characters."
              : undefined
          }
        />

        <FormError message={error} />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {/* A dedicated red button (the shared Button only has the brand color) */}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-medium text-onbrand shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden />
            )}
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
