// The big ticket window. Left: description, attachments, conversation, history. Right: details and controls.
import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { ApiError } from "../../api/client";
import { ticketsApi } from "../../api/tickets";
import { useToast } from "../../hooks/useToast";
import { ticketRef } from "../../lib/format";
import type { TicketDetailResponse, TicketFile, User } from "../../types";
import { OverdueBadge, PriorityBadge, StatusBadge } from "../ui/Badges";
import Modal from "../ui/Modal";
import Skeleton from "../ui/Skeleton";
import Attachments from "./Attachments";
import Conversation from "./Conversation";
import HistoryTimeline from "./HistoryTimeline";
import TicketSidePanel from "./TicketSidePanel";

interface Props {
  ticketId: number;
  user: User;
  onClose: () => void;
  /** Called after any change so the list behind the window refreshes. */
  onChanged: () => void;
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

  /** A change succeeded: show the fresh data, refresh the list, show a toast. */
  function apply(result: TicketDetailResponse, message: string) {
    setData({ ...result, files: result.files ?? [] });
    onChanged();
    toast.success(message);
  }

  const staff = user.role !== "USER";
  const closed = data?.ticket.status === "CLOSED";

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

  return (
    <Modal label={`Ticket ${ticketRef(ticketId)}`} onClose={onClose} size="xl">
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
        <div>
          {/* Header */}
          <header className="border-b border-slate-200 px-6 py-5 pr-14">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-medium text-slate-500">
                {ticketRef(data.ticket.id)}
              </span>
              <StatusBadge status={data.ticket.status} />
              <PriorityBadge priority={data.ticket.priority} />
              {data.ticket.is_overdue && <OverdueBadge />}
            </div>
            <h2 className="mt-2 break-words text-lg font-semibold text-slate-900">
              {data.ticket.title}
            </h2>
          </header>

          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            {/* Left column */}
            <div className="min-w-0 space-y-6">
              <section aria-label="Description">
                <h3 className="mb-2 text-sm font-semibold text-slate-900">
                  Description
                </h3>
                <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {data.ticket.description}
                </p>
              </section>

              <Attachments
                ticketId={ticketId}
                files={data.files}
                canAdd={!closed}
                canDelete={canDeleteFile}
                onDelete={deleteFile}
                onUpdated={apply}
              />

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

              {data.history && <HistoryTimeline history={data.history} />}
            </div>

            {/* Right column */}
            <div className="lg:border-l lg:border-slate-200 lg:pl-6">
              <TicketSidePanel
                ticket={data.ticket}
                user={user}
                onUpdated={apply}
              />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
