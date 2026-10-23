// The "Attachments" card of the ticket window: files on the ticket itself
// (files on a reply are shown under that reply instead).
// A small switch chooses grid or list (and remembers the choice).
// Choosing or dropping files uploads them straight away.
import { useState } from "react";
import { LayoutGrid, List, Paperclip } from "lucide-react";
import { ApiError } from "../../api/client";
import { ticketsApi } from "../../api/tickets";
import { useToast } from "../../hooks/useToast";
import { pickValidFiles, summarizeProblems } from "../../lib/files";
import { getStored, setStored } from "../../lib/storage";
import { cn } from "../../lib/cn";
import type { TicketDetailResponse, TicketFile } from "../../types";
import FileDropzone from "../ui/FileDropzone";
import AttachmentTiles from "./AttachmentTiles";
import SectionCard from "./SectionCard";

interface Props {
  ticketId: number;
  files: TicketFile[];
  /** False when the ticket is closed. */
  canAdd: boolean;
  canDelete: (file: TicketFile) => boolean;
  onDelete: (file: TicketFile) => Promise<void>;
  onUpdated: (result: TicketDetailResponse, message: string) => void;
}

const VIEW_KEY = "attachmentView";

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
  const [view, setView] = useState<"grid" | "list">(() =>
    getStored(VIEW_KEY) === "list" ? "list" : "grid",
  );

  const own = files.filter((f) => f.comment_id === null);

  // A closed ticket with no files has nothing to show
  if (own.length === 0 && !canAdd) return null;

  function chooseView(next: "grid" | "list") {
    setView(next);
    setStored(VIEW_KEY, next);
  }

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

  // The grid / list switch (only useful when there is something to show)
  const switcher =
    own.length > 0 ? (
      <div
        className="inline-flex rounded-lg border border-slate-200 p-0.5"
        role="group"
        aria-label="How to show the files"
      >
        {(
          [
            { key: "grid", label: "Grid view", Icon: LayoutGrid },
            { key: "list", label: "List view", Icon: List },
          ] as const
        ).map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => chooseView(key)}
            aria-pressed={view === key}
            aria-label={label}
            title={label}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              view === key
                ? "bg-brand/10 text-brand"
                : "text-slate-500 hover:bg-slate-100",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </button>
        ))}
      </div>
    ) : undefined;

  return (
    <SectionCard
      icon={Paperclip}
      title="Attachments"
      count={own.length}
      action={switcher}
    >
      <div className="space-y-3">
        <AttachmentTiles
          files={own}
          view={view}
          canDelete={canDelete}
          onDelete={onDelete}
        />
        {canAdd && (
          <FileDropzone
            onFiles={(f) => void add(f)}
            busy={busy}
            compact={own.length > 0}
          />
        )}
      </div>
    </SectionCard>
  );
}
