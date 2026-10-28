// "Delete this department?" If people have it, a department to move them to must be chosen first.
import { useState, type FormEvent } from "react";
import { Loader2, Trash2 } from "lucide-react";
import type { DepartmentRow } from "../../api/departments";
import Button from "../ui/Button";
import FormError from "../ui/FormError";
import Modal from "../ui/Modal";
import Select from "../ui/Select";

interface Props {
  department: DepartmentRow;
  /** The other visible departments (the places people can be moved to). */
  others: DepartmentRow[];
  busy: boolean;
  /** An error from the server, shown above the buttons. */
  error: string;
  onConfirm: (moveTo: number | undefined) => void;
  onClose: () => void;
}

export default function DeleteDepartmentModal({
  department,
  others,
  busy,
  error,
  onConfirm,
  onClose,
}: Props) {
  const [moveTo, setMoveTo] = useState("");
  const [touched, setTouched] = useState(false);

  const needsMove = department.users > 0;
  const missing = needsMove && !moveTo;
  const people = `${department.users} ${department.users === 1 ? "person has" : "people have"}`;

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (busy || missing) return;
    onConfirm(needsMove ? Number(moveTo) : undefined);
  }

  return (
    <Modal
      label={`Delete the department ${department.name}`}
      onClose={onClose}
      size="md"
    >
      <form onSubmit={submit} className="space-y-4 p-6" noValidate>
        <div className="pr-10">
          <h2 className="text-lg font-semibold text-slate-900">
            Delete "{department.name}"?
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {needsMove
              ? `${people} this department. They will be moved to the department you choose.`
              : "Nobody has this department, so nothing else changes."}{" "}
            This cannot be undone. To keep it for people who have it but stop
            offering it, hide it instead.
          </p>
        </div>

        {needsMove &&
          (others.length === 0 ? (
            <FormError message="There is no other visible department to move them to. Add one first." />
          ) : (
            <Select
              label="Move them to"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              error={touched && missing ? "Choose a department." : undefined}
            >
              <option value="">Choose a department</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          ))}

        <FormError message={error} />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {/* A dedicated red button (the shared Button only has the brand color) */}
          <button
            type="submit"
            disabled={busy || (needsMove && others.length === 0)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-medium text-onbrand shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden />
            )}
            Delete department
          </button>
        </div>
      </form>
    </Modal>
  );
}
