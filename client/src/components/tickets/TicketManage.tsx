// The "Manage ticket" card: progress steps, and below them priority, assignee and due date.
//  - IT / ADMIN can change them (unless the ticket is closed); every change is saved at once
//  - everyone else only sees the values
// The buttons that move the ticket forward live in the footer of the window; the other moves are here.
import { useEffect, useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { ticketsApi } from "../../api/tickets";
import { useToast } from "../../hooks/useToast";
import { formatDateTime, toLocalInputValue } from "../../lib/format";
import { PRIORITY_LIST, PRIORITY_META } from "../../lib/ticketMeta";
import type {
  Assignee,
  Priority,
  TicketDetail,
  TicketDetailResponse,
  TicketStatus,
} from "../../types";
import { PriorityBadge } from "../ui/Badges";
import Button from "../ui/Button";
import ProgressSteps from "./ProgressSteps";
import SectionCard from "./SectionCard";

interface Props {
  ticket: TicketDetail;
  /** IT/ADMIN and the ticket is not closed. */
  canEdit: boolean;
  /** What is being saved right now ('' = nothing). Used to disable the controls. */
  busy: string;
  /** Runs one change, shows the result, and reports an error as a toast (provided by the window). */
  run: (
    key: string,
    action: () => Promise<TicketDetailResponse>,
    message: string,
  ) => Promise<void>;
  /** The status moves that are not the main one (for example "Move back to Open"). */
  secondary: Array<{ to: TicketStatus; label: string }>;
  onMove: (to: TicketStatus) => void;
}

const FIELD_CLASS =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 transition " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:cursor-not-allowed disabled:opacity-60";

/** A small block with a label on top. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function TicketManage({
  ticket,
  canEdit,
  busy,
  run,
  secondary,
  onMove,
}: Props) {
  const toast = useToast();
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [dueInput, setDueInput] = useState(toLocalInputValue(ticket.due_at));

  // Keep the due-date box in step with the saved value
  useEffect(() => {
    setDueInput(toLocalInputValue(ticket.due_at));
  }, [ticket.due_at]);

  // IT / ADMIN load the list of people this ticket can be assigned to
  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    ticketsApi
      .assignees(ticket.id)
      .then((r) => !cancelled && setAssignees(r.assignees))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ticket.id, canEdit]);

  function saveDue() {
    const d = new Date(dueInput);
    if (!dueInput || Number.isNaN(d.getTime())) {
      toast.error("Please choose a valid date and time.");
      return;
    }
    void run(
      "due",
      () => ticketsApi.setDue(ticket.id, d.toISOString()),
      "Due date saved",
    );
  }

  // The current assignee might not be in the list (for example a role changed); still show them
  const assigneeOptions: Assignee[] =
    ticket.assigned_to &&
    ticket.assignee_name &&
    !assignees.some((a) => a.id === ticket.assigned_to)
      ? [
          { id: ticket.assigned_to, name: ticket.assignee_name, role: "IT" },
          ...assignees,
        ]
      : assignees;

  const dueChanged = dueInput !== toLocalInputValue(ticket.due_at);

  return (
    <SectionCard
      icon={SlidersHorizontal}
      title={canEdit ? "Manage ticket" : "Progress"}
    >
      <ProgressSteps status={ticket.status} />

      <dl className="mt-5 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-3">
        <Field label="Priority">
          {canEdit ? (
            <select
              aria-label="Priority"
              className={FIELD_CLASS}
              value={ticket.priority}
              disabled={!!busy}
              onChange={(e) =>
                void run(
                  "priority",
                  () =>
                    ticketsApi.setPriority(
                      ticket.id,
                      e.target.value as Priority,
                    ),
                  "Priority updated",
                )
              }
            >
              {PRIORITY_LIST.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </select>
          ) : (
            <PriorityBadge priority={ticket.priority} />
          )}
        </Field>

        <Field label="Assignee">
          {canEdit ? (
            <select
              aria-label="Assignee"
              className={FIELD_CLASS}
              value={ticket.assigned_to ?? ""}
              disabled={!!busy}
              onChange={(e) => {
                const v = e.target.value;
                void run(
                  "assignee",
                  () =>
                    ticketsApi.setAssignee(
                      ticket.id,
                      v === "" ? null : Number(v),
                    ),
                  v === "" ? "Assignee removed" : "Ticket assigned",
                );
              }}
            >
              <option value="">Unassigned</option>
              {assigneeOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.role})
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-slate-800">
              {ticket.assignee_name ?? "Unassigned"}
            </p>
          )}
        </Field>

        <Field label="Due date">
          {canEdit ? (
            <div className="space-y-2">
              <input
                type="datetime-local"
                aria-label="Due date"
                className={FIELD_CLASS}
                value={dueInput}
                min={toLocalInputValue(new Date().toISOString())}
                onChange={(e) => setDueInput(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!dueChanged || !dueInput || !!busy}
                  loading={busy === "due"}
                  onClick={saveDue}
                >
                  Save
                </Button>
                {ticket.due_at && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!!busy}
                    onClick={() =>
                      void run(
                        "due-clear",
                        () => ticketsApi.setDue(ticket.id, null),
                        "Due date cleared",
                      )
                    }
                  >
                    Clear
                  </Button>
                )}
              </div>
              {!ticket.due_at && (
                <p className="text-xs text-slate-500">
                  No manual date: the deadline follows the priority.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-800">
              {ticket.due_at ? formatDateTime(ticket.due_at) : "Not set"}
            </p>
          )}
        </Field>
      </dl>

      {/* The other status moves (the main one is the button in the footer) */}
      {canEdit && secondary.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
          <span className="text-xs text-slate-500">Other moves:</span>
          {secondary.map((m) => (
            <Button
              key={m.to}
              size="sm"
              variant="secondary"
              loading={busy === m.to}
              disabled={!!busy && busy !== m.to}
              onClick={() => onMove(m.to)}
            >
              {m.label}
            </Button>
          ))}
        </div>
      )}

      {ticket.is_overdue && (
        <p className="mt-3 text-xs font-medium text-rose-600">
          This ticket is overdue.
        </p>
      )}
    </SectionCard>
  );
}
