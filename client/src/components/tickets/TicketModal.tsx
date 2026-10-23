// The ticket window, one column inside a fixed frame:
//   header (ticket number, unit, department) -> scrolling body -> footer (Close, Delete, the next step)
// Body: status chips and title, the description, a strip of key facts, the "Manage ticket" card,
// the attachments, the conversation, and the history.
// Every change is still applied at once and audited on the server (nothing waits for a "Save" button).
import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, Mail, MessageSquare, Trash2 } from "lucide-react";
import { ApiError } from "../../api/client";
import { ticketsApi } from "../../api/tickets";
import { useToast } from "../../hooks/useToast";
import { formatDateTime, ticketRef, timeAgo } from "../../lib/format";
import { STATUS_META, TRANSITIONS } from "../../lib/ticketMeta";
import { cn } from "../../lib/cn";
import type {
  TicketDetailResponse,
  TicketFile,
  TicketStatus,
  User,
} from "../../types";
import { OverdueBadge, PriorityBadge, StatusBadge } from "../ui/Badges";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import ReasonModal from "../ui/ReasonModal";
import Skeleton from "../ui/Skeleton";
import Attachments from "./Attachments";
import Conversation from "./Conversation";
import HistoryTimeline from "./HistoryTimeline";
import SectionCard from "./SectionCard";
import TicketManage from "./TicketManage";

interface Props {
  ticketId: number;
  user: User;
  onClose: () => void;
  /** Called after any change so the list behind the window refreshes. */
  onChanged: () => void;
}

/** One small fact in the strip under the description (label above, value below). */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

/** The business unit as a small chip with a dot, in the brand color. */
function UnitChip({ code, name }: { code: string; name: string }) {
  return (
    <span
      title={name}
      className="inline-flex items-center gap-1.5 rounded-md bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
      {code}
    </span>
  );
}

export default function TicketModal({
  ticketId,
  user,
  onClose,
  onChanged,
}: Props) {
  const toast = useToast();
  const [data, setData] = useState<TicketDetailResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(""); // which change is being saved ('' = none)
  const [confirmClose, setConfirmClose] = useState(false); // "Close ticket" needs a second click
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Load the ticket. A ticket that is missing OR out of your scope looks the same: "not found".
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    ticketsApi
      .get(ticketId)
      .then((r) => !cancelled && setData({ ...r, files: r.files ?? [] }))
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? "This ticket was not found."
            : err instanceof ApiError
              ? err.message
              : "Could not load the ticket.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  // The "click again to close" question goes away after 4 seconds
  useEffect(() => {
    if (!confirmClose) return;
    const t = window.setTimeout(() => setConfirmClose(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmClose]);

  /** A change succeeded: show the fresh data, refresh the list, show a toast. */
  function apply(result: TicketDetailResponse, message: string) {
    setData({ ...result, files: result.files ?? [] });
    onChanged();
    toast.success(message);
  }

  /** Runs one change, shows the result, and reports a problem as a toast. */
  async function run(
    key: string,
    action: () => Promise<TicketDetailResponse>,
    message: string,
  ) {
    if (busy) return;
    setBusy(key);
    try {
      apply(await action(), message);
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

  async function move(to: TicketStatus) {
    await run(
      to,
      () => ticketsApi.setStatus(ticketId, to),
      `Status: ${STATUS_META[to].label}`,
    );
  }

  const staff = user.role !== "USER";
  const closed = data?.ticket.status === "CLOSED";
  const canEdit = staff && !closed;

  /** Who may remove a file (the server checks again): the uploader or IT/ADMIN, never on a closed ticket. */
  const canDeleteFile = (f: TicketFile) =>
    !closed && (staff || f.uploaded_by === user.id);

  async function deleteFile(f: TicketFile) {
    try {
      apply(await ticketsApi.deleteFile(f.id), "File removed");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not remove the file.",
      );
    }
  }

  /** The reason was typed: erase the ticket for good. */
  async function confirmDelete(reason: string) {
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await ticketsApi.deleteTicket(ticketId, reason);
      toast.success(`${ticketRef(ticketId)} was permanently deleted`);
      onChanged(); // the list and the dashboard load again without it
      onClose(); // this window disappears (the ticket no longer exists)
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? err.message
          : "Could not delete. Please try again.",
      );
      setDeleteBusy(false);
    }
  }

  // The main next step for this ticket (Start work / Mark resolved / Close ticket), shown in the footer
  const moves = data ? TRANSITIONS[data.ticket.status] : [];
  const primary = canEdit ? moves.find((m) => m.primary) : undefined;
  const secondary = moves.filter((m) => !m.primary);

  return (
    <>
      <Modal
        label={`Ticket ${ticketRef(ticketId)}`}
        onClose={onClose}
        size="wide"
      >
        {error ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <AlertCircle className="mb-3 h-8 w-8 text-slate-400" aria-hidden />
            <p className="text-sm font-medium text-slate-900">{error}</p>
          </div>
        ) : !data ? (
          <div
            className="space-y-4 p-6"
            aria-busy="true"
            aria-label="Loading ticket"
          >
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          // A fixed frame: the header and footer stay, only the middle scrolls
          <div className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl sm:max-h-[calc(100dvh-3rem)]">
            {/* ---------- header ---------- */}
            <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-6 py-4 pr-14">
              <span className="shrink-0 rounded-md bg-brand px-2.5 py-1 font-mono text-sm font-semibold text-onbrand">
                {ticketRef(data.ticket.id)}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-900">
                    Ticket details
                  </h2>
                  <UnitChip
                    code={data.ticket.unit_code}
                    name={data.ticket.unit_name}
                  />
                </div>
                <p className="truncate text-xs text-slate-500">
                  {data.ticket.requester_department ?? data.ticket.unit_name}
                </p>
              </div>
            </header>

            {/* ---------- body (scrolls) ---------- */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50 px-6 py-5">
              {/* Status chips and the title */}
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={data.ticket.status} />
                  <PriorityBadge priority={data.ticket.priority} />
                  {data.ticket.is_overdue && <OverdueBadge />}
                  {data.ticket.source === "EMAIL" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                      <Mail className="h-3 w-3" aria-hidden /> Email
                    </span>
                  )}
                </div>
                <h3 className="break-words text-lg font-semibold text-slate-900">
                  {data.ticket.title}
                </h3>
              </div>

              {/* The description (plain text: React escapes it) */}
              <p className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                {data.ticket.description}
              </p>

              {/* Key facts */}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-xl border border-slate-200 bg-slate-100/60 p-4 md:grid-cols-4">
                <Fact label="Created by">
                  <p className="truncate font-semibold">
                    {data.ticket.requester_name}
                  </p>
                  <p
                    className="truncate text-xs text-slate-500"
                    title={data.ticket.requester_email}
                  >
                    {data.ticket.requester_email}
                  </p>
                </Fact>
                <Fact label="Submitted on">
                  <p className="font-semibold">
                    {formatDateTime(data.ticket.created_at)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Updated {timeAgo(data.ticket.updated_at)}
                  </p>
                </Fact>
                <Fact label="Business unit">
                  <UnitChip
                    code={data.ticket.unit_code}
                    name={data.ticket.unit_name}
                  />
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {data.ticket.unit_name}
                  </p>
                </Fact>
                <Fact label="Department">
                  {data.ticket.requester_department ? (
                    <span className="font-semibold">
                      {data.ticket.requester_department}
                    </span>
                  ) : (
                    <span className="text-slate-400">Not set</span>
                  )}
                </Fact>
              </dl>

              {/* Progress, priority, assignee, due date */}
              <TicketManage
                ticket={data.ticket}
                canEdit={canEdit}
                busy={busy}
                run={run}
                secondary={secondary}
                onMove={(to) => void move(to)}
              />

              <Attachments
                ticketId={ticketId}
                files={data.files}
                canAdd={!closed}
                canDelete={canDeleteFile}
                onDelete={deleteFile}
                onUpdated={apply}
              />

              <SectionCard
                icon={MessageSquare}
                title="Conversation"
                count={data.comments.length}
              >
                <Conversation
                  comments={data.comments}
                  files={data.files}
                  staff={staff}
                  readOnly={!!closed}
                  canDeleteFile={canDeleteFile}
                  onDeleteFile={deleteFile}
                  onSend={async (body, internal, files) => {
                    const r = await ticketsApi.addComment(
                      ticketId,
                      body,
                      internal,
                      files,
                    );
                    apply(r, internal ? "Internal note added" : "Reply sent");
                  }}
                />
              </SectionCard>

              {/* The audit history (IT / ADMIN only; collapsed until opened) */}
              {data.history && (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <HistoryTimeline history={data.history} />
                </div>
              )}
            </div>

            {/* ---------- footer ---------- */}
            <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-6 py-3">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>

              {/* Permanent delete: IT and ADMIN only (the server checks again) */}
              {staff && (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError("");
                    setDeleteOpen(true);
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Delete Ticket
                </button>
              )}

              <div className="ml-auto flex items-center gap-2">
                {closed && (
                  <span className="text-xs text-slate-500">
                    This ticket is closed and read-only.
                  </span>
                )}
                {primary && (
                  <Button
                    loading={busy === primary.to}
                    disabled={!!busy && busy !== primary.to}
                    className={cn(
                      primary.to === "CLOSED" &&
                        confirmClose &&
                        "bg-rose-600 hover:bg-rose-600",
                    )}
                    onClick={() => {
                      // Closing needs a second click, because a closed ticket can never be changed again
                      if (primary.to === "CLOSED" && !confirmClose) {
                        setConfirmClose(true);
                        return;
                      }
                      setConfirmClose(false);
                      void move(primary.to);
                    }}
                  >
                    {primary.to === "CLOSED" && confirmClose
                      ? "Click again to confirm"
                      : primary.label}
                  </Button>
                )}
              </div>
            </footer>
          </div>
        )}
      </Modal>

      {deleteOpen && (
        <ReasonModal
          title={`Delete ${ticketRef(ticketId)} permanently?`}
          message="The ticket, all its replies and all its attachments are erased and cannot be recovered. A short record (number, title, requester and your reason) stays in the audit log."
          confirmLabel="Delete permanently"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={(reason) => void confirmDelete(reason)}
          onClose={() => !deleteBusy && setDeleteOpen(false)}
        />
      )}
    </>
  );
}
