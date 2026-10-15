// The "Create Ticket" window.
//  - everyone: title + description (+ optional pictures or PDFs)
//  - IT / ADMIN: can also choose a priority (a USER's ticket is always Medium; the server enforces it)
//  - ADMIN: can also choose the business unit (everyone else uses their own unit)
// Files are sent right after the ticket exists (two requests), so the server needs no special "create with files" route.
import { useEffect, useState, type FormEvent } from "react";
import { authApi } from "../../api/auth";
import { ApiError } from "../../api/client";
import { ticketsApi } from "../../api/tickets";
import { useToast } from "../../hooks/useToast";
import { pickValidFiles, summarizeProblems } from "../../lib/files";
import { PRIORITY_LIST, PRIORITY_META } from "../../lib/ticketMeta";
import { ticketRef } from "../../lib/format";
import type { Priority, UnitOption, User } from "../../types";
import Button from "../ui/Button";
import FileDropzone from "../ui/FileDropzone";
import FormError from "../ui/FormError";
import Input from "../ui/Input";
import Modal from "../ui/Modal";
import PendingFileList from "../ui/PendingFileList";
import Select from "../ui/Select";
import Textarea from "../ui/Textarea";

interface Props {
  user: User;
  onClose: () => void;
  /** Called with the new ticket's id after it was created. */
  onCreated: (id: number) => void;
}

export default function CreateTicketModal({ user, onClose, onCreated }: Props) {
  const toast = useToast();
  const staff = user.role !== "USER";
  const isAdmin = user.role === "ADMIN";
  const noUnit = user.business_unit_id === null && !isAdmin;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [unitId, setUnitId] = useState(
    user.business_unit_id ? String(user.business_unit_id) : "",
  );
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [pending, setPending] = useState<File[]>([]);
  const [errors, setErrors] = useState<{
    title?: string;
    description?: string;
    unit?: string;
  }>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  // Only ADMIN needs the list of units
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    authApi
      .units()
      .then((r) => !cancelled && setUnits(r.units))
      .catch(
        () => !cancelled && setFormError("Could not load the business units."),
      );
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  function addPending(chosen: File[]) {
    const { accepted, problems } = pickValidFiles(chosen, pending.length);
    if (problems.length > 0) toast.error(summarizeProblems(problems));
    if (accepted.length > 0) setPending((p) => [...p, ...accepted]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    const errs: typeof errors = {};
    if (title.trim().length < 3)
      errs.title = "Please enter a title (at least 3 characters).";
    if (description.trim().length < 3)
      errs.description = "Please describe the problem.";
    if (isAdmin && !unitId) errs.unit = "Choose a business unit.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setBusy(true);
    setFormError("");

    // Step 1: create the ticket
    let newId: number;
    try {
      const r = await ticketsApi.create({
        title: title.trim(),
        description: description.trim(),
        ...(staff ? { priority } : {}),
        ...(isAdmin ? { business_unit_id: Number(unitId) } : {}),
      });
      newId = r.ticket.id;
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setBusy(false);
      return;
    }

    // Step 2: attach the files. If this fails the ticket still exists, so we say so clearly.
    if (pending.length > 0) {
      try {
        await ticketsApi.uploadFiles(newId, pending);
        toast.success(
          `${ticketRef(newId)} created with ${pending.length} file${pending.length === 1 ? "" : "s"}`,
        );
      } catch {
        toast.error(
          `${ticketRef(newId)} was created, but the files could not be attached. You can add them in the ticket.`,
        );
      }
    } else {
      toast.success(`${ticketRef(newId)} created`);
    }
    onCreated(newId);
  }

  return (
    <Modal label="Create ticket" onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-4 p-6" noValidate>
        <div className="pr-10">
          <h2 className="text-lg font-semibold text-slate-900">
            Create ticket
          </h2>
          <p className="text-sm text-slate-500">
            Tell us what is wrong and the IT team will pick it up.
          </p>
        </div>

        <FormError
          message={
            noUnit
              ? "Your account has no business unit. Please ask an administrator to set one."
              : formError
          }
        />

        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          maxLength={200}
          placeholder="Short summary, e.g. Printer on level 3 is offline"
          autoFocus
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          maxLength={20000}
          rows={6}
          placeholder="What happened? What have you already tried?"
        />

        {(staff || isAdmin) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {staff && (
              <Select
                label="Priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
              >
                {PRIORITY_LIST.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_META[p].label}
                  </option>
                ))}
              </Select>
            )}
            {isAdmin && (
              <Select
                label="Business unit"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                error={errors.unit}
              >
                <option value="">Choose a unit</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.code})
                  </option>
                ))}
              </Select>
            )}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">
            Attachments{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </p>
          <PendingFileList
            files={pending}
            onRemove={(i) => setPending((p) => p.filter((_, idx) => idx !== i))}
          />
          <FileDropzone
            compact
            onFiles={addPending}
            disabled={busy}
            label="Add pictures or PDFs"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={noUnit}>
            Create ticket
          </Button>
        </div>
      </form>
    </Modal>
  );
}
