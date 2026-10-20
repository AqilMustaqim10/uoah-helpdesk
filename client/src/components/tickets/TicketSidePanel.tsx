// The right-hand column of the ticket window: progress, status buttons, priority,
// assignee, due date and facts about the ticket.
// IT / ADMIN can edit (unless the ticket is closed). A USER only sees the values.
import { useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import { ticketsApi } from "../../api/tickets";
import { useToast } from "../../hooks/useToast";
import { formatDateTime, toLocalInputValue } from "../../lib/format";
import {
  PRIORITY_LIST,
  PRIORITY_META,
  STATUS_META,
  TRANSITIONS,
} from "../../lib/ticketMeta";
import { cn } from "../../lib/cn";
import type {
  Assignee,
  Priority,
  TicketDetail,
  TicketDetailResponse,
  User,
} from "../../types";
import Button from "../ui/Button";
import { PriorityBadge } from "../ui/Badges";
import ProgressSteps from "./ProgressSteps";

interface Props {
  ticket: TicketDetail;
  user: User;
  onUpdated: (result: TicketDetailResponse, message: string) => void;
}

const FIELD_CLASS =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 transition " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

/** A small block with a label on top. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      {children}
    </div>
  );
}

export default function TicketSidePanel({ ticket, user, onUpdated }: Props) {
  const toast = useToast();
  const staff = user.role !== "USER";
  const readOnly = ticket.status === "CLOSED";
  const canEdit = staff && !readOnly;

  const [busy, setBusy] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [dueInput, setDueInput] = useState(toLocalInputValue(ticket.due_at));

  // Keep the due-date box in step with the saved value
  useEffect(() => {
    setDueInput(toLocalInputValue(ticket.due_at));
  }, [ticket.due_at]);

  // Staff load the list of people who can be assigned
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

  // "Close ticket" needs a second click; the confirmation resets after 4 seconds
  useEffect(() => {
    if (!confirmClose) return;
    const t = window.setTimeout(() => setConfirmClose(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmClose]);

  /** Runs one change, shows the result, and reports errors as a toast. */
  async function run(
    key: string,
    action: () => Promise<TicketDetailResponse>,
    message: string,
  ) {
    if (busy) return;
    setBusy(key);
    try {
      onUpdated(await action(), message);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy("");
    }
  }

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
    <aside className="space-y-5" aria-label="Ticket details">
      <Field label="Progress">
        <ProgressSteps status={ticket.status} />
      </Field>

      {/* Status buttons */}
      {canEdit && TRANSITIONS[ticket.status].length > 0 && (
        <div className="space-y-2">
          {TRANSITIONS[ticket.status].map((tr) => {
            const isClose = tr.to === "CLOSED";
            return (
              <Button
                key={tr.to}
                size="sm"
                variant={tr.primary ? "primary" : "secondary"}
                className={cn(
                  "w-full",
                  isClose && confirmClose && "bg-rose-600 hover:bg-rose-600",
                )}
                loading={busy === tr.to}
                disabled={!!busy && busy !== tr.to}
                onClick={() => {
                  if (isClose && !confirmClose) {
                    setConfirmClose(true);
                    return;
                  }
                  setConfirmClose(false);
                  void run(
                    tr.to,
                    () => ticketsApi.setStatus(ticket.id, tr.to),
                    `Status: ${STATUS_META[tr.to].label}`,
                  );
                }}
              >
                {isClose && confirmClose ? "Click again to confirm" : tr.label}
              </Button>
            );
          })}
        </div>
      )}

      <div className="space-y-4 border-t border-slate-200 pt-4">
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
            <p className="text-sm text-slate-700">
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
            <p className="text-sm text-slate-700">
              {ticket.due_at ? formatDateTime(ticket.due_at) : "Not set"}
            </p>
          )}
          {ticket.is_overdue && (
            <p className="mt-1 text-xs font-medium text-rose-600">
              This ticket is overdue.
            </p>
          )}
        </Field>
      </div>

      <dl className="space-y-3 border-t border-slate-200 pt-4 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Requester
          </dt>
          <dd className="text-slate-700">{ticket.requester_name}</dd>
          <dd className="break-all text-xs text-slate-500">
            {ticket.requester_email}
          </dd>
          {ticket.requester_department && (
            <dd className="text-xs text-slate-500">
              {ticket.requester_department}
            </dd>
          )}
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Business unit
          </dt>
          <dd className="text-slate-700">{ticket.unit_name}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Created
          </dt>
          <dd className="text-slate-700">
            {formatDateTime(ticket.created_at)}
            {ticket.source === "EMAIL" && (
              <span className="text-slate-400"> (by email)</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Last update
          </dt>
          <dd className="text-slate-700">
            {formatDateTime(ticket.updated_at)}
          </dd>
        </div>
      </dl>
    </aside>
  );
}
