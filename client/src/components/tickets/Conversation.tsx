// The replies on a ticket (with avatars and attachments) and the box to write a new one.
//  - IT / ADMIN can switch between a public reply and an internal note (amber, never shown to the requester)
//  - files can be attached to a reply
//  - a closed ticket shows a notice instead of the box
// Text is shown as plain text (React escapes it), so nobody can inject HTML.
import { useState } from "react";
import { Lock, Send } from "lucide-react";
import { ApiError } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { formatDateTime, timeAgo } from "../../lib/format";
import { pickValidFiles, summarizeProblems } from "../../lib/files";
import { cn } from "../../lib/cn";
import type { CommentItem, TicketFile } from "../../types";
import AttachmentGrid from "../ui/AttachmentGrid";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";
import FileDropzone from "../ui/FileDropzone";
import PendingFileList from "../ui/PendingFileList";
import RoleBadge from "../ui/RoleBadge";
import Textarea from "../ui/Textarea";

interface Props {
  comments: CommentItem[];
  /** Every file of the ticket; each reply shows the ones that belong to it. */
  files: TicketFile[];
  staff: boolean;
  readOnly: boolean;
  canDeleteFile: (file: TicketFile) => boolean;
  onDeleteFile: (file: TicketFile) => Promise<void>;
  onSend: (body: string, internal: boolean, files: File[]) => Promise<void>;
}

export default function Conversation({
  comments,
  files,
  staff,
  readOnly,
  canDeleteFile,
  onDeleteFile,
  onSend,
}: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [pending, setPending] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const isNote = mode === "note";
  const canSend = text.trim().length > 0 || pending.length > 0;

  function addPending(chosen: File[]) {
    const { accepted, problems } = pickValidFiles(chosen, pending.length);
    if (problems.length > 0) toast.error(summarizeProblems(problems));
    if (accepted.length > 0) setPending((p) => [...p, ...accepted]);
  }

  async function send() {
    if (!canSend || busy) return;
    setBusy(true);
    try {
      await onSend(text.trim(), isNote, pending);
      setText("");
      setPending([]);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Could not send. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Conversation">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">
        Conversation
      </h3>

      {comments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          No replies yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => {
            const own = files.filter((f) => f.comment_id === c.id);
            return (
              <li key={c.id} className="flex animate-fade-in gap-3">
                <Avatar name={c.author_name} />
                <div
                  className={cn(
                    "min-w-0 flex-1 rounded-xl border px-3 py-2",
                    c.is_internal
                      ? "border-amber-200 bg-amber-50"
                      : "border-slate-200 bg-white",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className="text-sm font-medium text-slate-900">
                      {c.author_name}
                    </span>
                    {c.author_role !== "USER" && (
                      <RoleBadge role={c.author_role} />
                    )}
                    {c.is_internal && (
                      <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                        <Lock className="h-3 w-3" aria-hidden /> Internal note
                      </span>
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
                      <AttachmentGrid
                        files={own}
                        canDelete={canDeleteFile}
                        onDelete={onDeleteFile}
                      />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Writing area */}
      <div className="mt-4">
        {readOnly ? (
          <p className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
            <Lock className="h-4 w-4 shrink-0" aria-hidden />
            This ticket is closed and read-only.
          </p>
        ) : (
          <div className="space-y-2">
            {staff && (
              <div
                className="inline-flex rounded-lg border border-slate-200 p-0.5"
                role="group"
                aria-label="Type of message"
              >
                <button
                  type="button"
                  onClick={() => setMode("reply")}
                  aria-pressed={!isNote}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                    !isNote
                      ? "bg-brand text-onbrand"
                      : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  Reply
                </button>
                <button
                  type="button"
                  onClick={() => setMode("note")}
                  aria-pressed={isNote}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                    isNote
                      ? "bg-amber-500 text-onbrand"
                      : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  Internal note
                </button>
              </div>
            )}

            <Textarea
              label={isNote ? "Internal note" : "Reply"}
              hideLabel
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void send();
                }
              }}
              maxLength={10000}
              rows={3}
              placeholder={
                isNote ? "Only IT staff can see this note." : "Write a reply…"
              }
              className={isNote ? "border-amber-300 bg-amber-50" : undefined}
            />

            <PendingFileList
              files={pending}
              onRemove={(i) =>
                setPending((p) => p.filter((_, idx) => idx !== i))
              }
            />
            <FileDropzone
              compact
              onFiles={addPending}
              disabled={busy}
              label="Attach pictures or PDFs"
            />

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-400">Ctrl + Enter to send</p>
              <Button
                size="sm"
                icon={<Send className="h-4 w-4" />}
                loading={busy}
                disabled={!canSend}
                onClick={() => void send()}
                className={
                  isNote ? "bg-amber-500 hover:bg-amber-500" : undefined
                }
              >
                {isNote ? "Add note" : "Send reply"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
