// The "Attachments" section of the ticket window: files on the ticket itself
// (files on a reply are shown under that reply instead).
// Choosing or dropping files uploads them straight away.
import { useState } from "react";
import { ApiError } from "../../api/client";
import { ticketsApi } from "../../api/tickets";
import { useToast } from "../../hooks/useToast";
import { pickValidFiles, summarizeProblems } from "../../lib/files";
import type { TicketDetailResponse, TicketFile } from "../../types";
import AttachmentGrid from "../ui/AttachmentGrid";
import FileDropzone from "../ui/FileDropzone";

interface Props {
  ticketId: number;
  files: TicketFile[];
  /** False when the ticket is closed. */
  canAdd: boolean;
  canDelete: (file: TicketFile) => boolean;
  onDelete: (file: TicketFile) => Promise<void>;
  onUpdated: (result: TicketDetailResponse, message: string) => void;
}

export default function Attachments({
  ticketId,
  files,
  canAdd,
  canDelete,
  onDelete,
  onUpdated,
}: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const own = files.filter((f) => f.comment_id === null);

  // A closed ticket with no files has nothing to show
  if (own.length === 0 && !canAdd) return null;

  async function add(chosen: File[]) {
    const { accepted, problems } = pickValidFiles(chosen, own.length);
    if (problems.length > 0) toast.error(summarizeProblems(problems));
    if (accepted.length === 0) return;

    setBusy(true);
    try {
      const result = await ticketsApi.uploadFiles(ticketId, accepted);
      onUpdated(
        result,
        accepted.length === 1
          ? "File attached"
          : `${accepted.length} files attached`,
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Could not upload. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Attachments" className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">
        Attachments{" "}
        {own.length > 0 && (
          <span className="font-normal text-slate-400">({own.length})</span>
        )}
      </h3>
      <AttachmentGrid files={own} canDelete={canDelete} onDelete={onDelete} />
      {canAdd && (
        <FileDropzone
          onFiles={(f) => void add(f)}
          busy={busy}
          compact={own.length > 0}
        />
      )}
    </section>
  );
}
