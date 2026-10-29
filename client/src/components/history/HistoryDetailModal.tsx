// One finished ticket, READ-ONLY: description, key facts, attachments and the public replies.
//  - IT: nothing can be changed here. A "View only" note replaces every action.
//  - ADMIN: a "Manage ticket" button opens the ticket in the full ticket window (delete and so on).
// Internal notes and the audit history are never shown here (the server does not send them).
import { useEffect, useState, type ReactNode } from "react";
import {
  AlertCircle,
  FileText,
  ImageOff,
  Lock,
  MessageSquare,
  Paperclip,
  SlidersHorizontal,
} from "lucide-react";
import { ApiError } from "../../api/client";
import {
  historyApi,
  type HistoryDetailResponse,
  type HistoryFile,
} from "../../api/history";
import { formatBytes, isImage } from "../../lib/files";
import { formatDateTime, ticketRef, timeAgo } from "../../lib/format";
import type { User } from "../../types";
import Avatar from "../ui/Avatar";
import { PriorityBadge, StatusBadge } from "../ui/Badges";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import RoleBadge from "../ui/RoleBadge";
import Skeleton from "../ui/Skeleton";

interface Props {
  ticketId: number;
  user: User;
  onClose: () => void;
  /** Given only to ADMIN. Opens the full ticket window. */
  onManage?: (id: number) => void;
}

/** A white card with a small icon + title row. */
function Card({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: typeof Paperclip;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-xl border border-slate-200 bg-white"
    >
      <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <Icon className="h-4 w-4 shrink-0 text-brand" aria-hidden />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
          {title}
        </h3>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
            {count}
          </span>
        )}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** One small fact (label above, value below). */
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

/** A picture tile, or an icon for PDFs and for pictures that cannot be loaded. Opens the file in a new tab. */
function FileTile({ file }: { file: HistoryFile }) {
  const [failed, setFailed] = useState(false);
  return (
    <a
      href={`/api/history/files/${file.id}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`${file.original_name} (${formatBytes(file.size_bytes)})`}
      className="block w-36"
    >
      {isImage(file.mime) && !failed ? (
        <img
          src={`/api/history/files/${file.id}`}
          alt={file.original_name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-24 w-36 rounded-lg border border-slate-200 object-cover"
        />
      ) : (
        <div className="flex h-24 w-36 items-center justify-center rounded-lg border border-slate-200 bg-slate-100">
          {isImage(file.mime) ? (
            <ImageOff className="h-6 w-6 text-slate-400" aria-hidden />
          ) : (
            <FileText className="h-7 w-7 text-rose-500" aria-hidden />
          )}
        </div>
      )}
      <span className="mt-1 block truncate text-xs font-medium text-slate-700">
        {file.original_name}
      </span>
      <span className="block text-[11px] text-slate-400">
        {formatBytes(file.size_bytes)}
      </span>
    </a>
  );
}

function Files({ files }: { files: HistoryFile[] }) {
  if (files.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-3">
      {files.map((f) => (
        <li key={f.id}>
          <FileTile file={f} />
        </li>
      ))}
    </ul>
  );
}

export default function HistoryDetailModal({
  ticketId,
  user,
  onClose,
  onManage,
}: Props) {
  const [data, setData] = useState<HistoryDetailResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    historyApi
      .get(ticketId)
      .then((r) => !cancelled && setData(r))
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? "This ticket is no longer in the history. It may have been reopened or deleted."
            : err instanceof ApiError
              ? err.message
              : "Could not load the ticket.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  // The management button needs BOTH: an administrator on the screen AND the server's own hint.
  // (Hiding it is cosmetic. The routes that change things check the role again.)
  const canManage =
    user.role === "ADMIN" && !!onManage && data?.canManage === true;

  const t = data?.ticket;
  const ownFiles = data ? data.files.filter((f) => f.comment_id === null) : [];

  return (
    <Modal
      label={`Ticket ${ticketRef(ticketId)} (history)`}
      onClose={onClose}
      size="xl"
    >
      {error ? (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <AlertCircle className="mb-3 h-8 w-8 text-slate-400" aria-hidden />
          <p className="max-w-sm text-sm font-medium text-slate-900">{error}</p>
        </div>
      ) : !data || !t ? (
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
          {/* header */}
          <header className="flex items-center gap-3 border-b border-slate-200 px-6 py-4 pr-14">
            <span className="shrink-0 rounded-md bg-brand px-2.5 py-1 font-mono text-sm font-semibold text-onbrand">
              {ticketRef(t.id)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  Ticket history
                </h2>
                <span
                  title={t.unit_name}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-brand"
                    aria-hidden
                  />
                  {t.unit_code}
                </span>
              </div>
              <p className="truncate text-xs text-slate-500">
                {t.requester_department ?? t.unit_name}
              </p>
            </div>
          </header>

          {/* body */}
          <div className="space-y-4 bg-slate-50 px-6 py-5">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={t.status} />
                <PriorityBadge priority={t.priority} />
              </div>
              <h3 className="break-words text-lg font-semibold text-slate-900">
                {t.title}
              </h3>
            </div>

            {/* plain text: React escapes it, so nobody can inject HTML */}
            <p className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              {t.description}
            </p>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-xl border border-slate-200 bg-slate-100/60 p-4 md:grid-cols-3">
              <Fact label="Created by">
                <p className="truncate font-semibold">{t.requester_name}</p>
                <p
                  className="truncate text-xs text-slate-500"
                  title={t.requester_email}
                >
                  {t.requester_email}
                </p>
              </Fact>
              <Fact label="Submitted on">
                <p className="font-semibold">{formatDateTime(t.created_at)}</p>
              </Fact>
              <Fact label={t.status === "CLOSED" ? "Closed on" : "Resolved on"}>
                <p className="font-semibold">{formatDateTime(t.finished_at)}</p>
              </Fact>
              <Fact label="Business unit">
                <p className="font-semibold">{t.unit_name}</p>
              </Fact>
              <Fact label="Department">
                {t.requester_department ? (
                  <span className="font-semibold">
                    {t.requester_department}
                  </span>
                ) : (
                  <span className="text-slate-400">Not set</span>
                )}
              </Fact>
              <Fact label="Handled by">
                {t.assignee_name ? (
                  <span className="font-semibold">{t.assignee_name}</span>
                ) : (
                  <span className="text-slate-400">Nobody was assigned</span>
                )}
              </Fact>
            </dl>

            {ownFiles.length > 0 && (
              <Card
                icon={Paperclip}
                title="Attachments"
                count={ownFiles.length}
              >
                <Files files={ownFiles} />
              </Card>
            )}

            <Card
              icon={MessageSquare}
              title="Conversation"
              count={data.comments.length}
            >
              {data.comments.length === 0 ? (
                <p className="text-sm text-slate-500">No replies.</p>
              ) : (
                <ul className="space-y-3">
                  {data.comments.map((c) => {
                    const own = data.files.filter((f) => f.comment_id === c.id);
                    return (
                      <li key={c.id} className="flex gap-3">
                        <Avatar name={c.author_name} />
                        <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                            <span className="text-sm font-medium text-slate-900">
                              {c.author_name}
                            </span>
                            {c.author_role !== "USER" && (
                              <RoleBadge role={c.author_role} />
                            )}
                            {c.source === "EMAIL" && (
                              <span className="text-slate-400">via email</span>
                            )}
                            <span
                              className="text-slate-400"
                              title={formatDateTime(c.created_at)}
                            >
                              {timeAgo(c.created_at)}
                            </span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">
                            {c.body}
                          </p>
                          {own.length > 0 && (
                            <div className="mt-2">
                              <Files files={own} />
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
                <Lock className="h-3 w-3" aria-hidden /> Internal notes are not
                shown in the history.
              </p>
            </Card>
          </div>

          {/* footer: the only difference between the roles */}
          <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-6 py-3">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {canManage ? (
              <Button
                className="ml-auto"
                icon={<SlidersHorizontal className="h-4 w-4" />}
                onClick={() => {
                  onClose();
                  onManage!(ticketId); // opens the full ticket window (delete, and so on)
                }}
              >
                Manage ticket
              </Button>
            ) : (
              <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500">
                <Lock className="h-3.5 w-3.5" aria-hidden /> View only
              </span>
            )}
          </footer>
        </div>
      )}
    </Modal>
  );
}
