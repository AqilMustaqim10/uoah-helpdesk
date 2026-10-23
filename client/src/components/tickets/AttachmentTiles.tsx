// The saved files of a ticket, as picture tiles (grid) or as a list.
// Clicking a file opens it in a new tab (the server checks that you may see it).
// The trash button needs two clicks: the first one turns it red.
import { useEffect, useState } from "react";
import { FileText, ImageOff, Loader2, Trash2 } from "lucide-react";
import type { TicketFile } from "../../types";
import { formatBytes, isImage } from "../../lib/files";
import { timeAgo } from "../../lib/format";
import { cn } from "../../lib/cn";

interface Props {
  files: TicketFile[];
  view: "grid" | "list";
  canDelete: (file: TicketFile) => boolean;
  onDelete: (file: TicketFile) => Promise<void>;
}

/** A picture preview, or an icon for PDFs and for pictures that cannot be loaded. */
function Thumb({ file, className }: { file: TicketFile; className: string }) {
  const [failed, setFailed] = useState(false);

  if (isImage(file.mime) && !failed) {
    return (
      <img
        src={`/api/files/${file.id}`}
        alt={file.original_name}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn("object-cover", className)}
      />
    );
  }
  return (
    <div
      className={cn("flex items-center justify-center bg-slate-100", className)}
    >
      {isImage(file.mime) ? (
        <ImageOff className="h-6 w-6 text-slate-400" aria-hidden />
      ) : (
        <FileText className="h-7 w-7 text-rose-500" aria-hidden />
      )}
    </div>
  );
}

export default function AttachmentTiles({
  files,
  view,
  canDelete,
  onDelete,
}: Props) {
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // The "confirm" state resets by itself after 4 seconds
  useEffect(() => {
    if (confirmId === null) return;
    const t = window.setTimeout(() => setConfirmId(null), 4000);
    return () => window.clearTimeout(t);
  }, [confirmId]);

  async function remove(file: TicketFile) {
    if (confirmId !== file.id) {
      setConfirmId(file.id);
      return;
    }
    setConfirmId(null);
    setBusyId(file.id);
    try {
      await onDelete(file);
    } finally {
      setBusyId(null);
    }
  }

  if (files.length === 0) return null;

  /** The trash button. overlay = it floats on the corner of a tile (grid view). */
  function trash(f: TicketFile, overlay: boolean) {
    if (!canDelete(f)) return null;
    const confirming = confirmId === f.id;
    const busy = busyId === f.id;
    return (
      <button
        type="button"
        onClick={() => void remove(f)}
        disabled={busy}
        aria-label={
          confirming
            ? `Click again to remove ${f.original_name}`
            : `Remove ${f.original_name}`
        }
        title={confirming ? "Click again to remove" : "Remove"}
        className={cn(
          "inline-flex items-center justify-center gap-1 text-xs font-medium transition",
          overlay
            ? "absolute right-1.5 top-1.5 h-7 w-7 rounded-full shadow"
            : "h-8 shrink-0 rounded-md px-2",
          overlay &&
            !confirming &&
            "bg-white text-slate-600 opacity-100 hover:text-rose-600 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100",
          !overlay &&
            !confirming &&
            "text-slate-500 hover:bg-slate-100 hover:text-rose-600",
          confirming && "bg-rose-600 text-onbrand opacity-100",
        )}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
        {!overlay && confirming && "Confirm"}
      </button>
    );
  }

  // ---------- list view ----------
  if (view === "list") {
    return (
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200">
        {files.map((f) => (
          <li
            key={f.id}
            className="flex animate-fade-in items-center gap-3 bg-white px-3 py-2"
          >
            <a
              href={`/api/files/${f.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <Thumb
                file={f}
                className="h-10 w-10 shrink-0 rounded-md border border-slate-200"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800">
                  {f.original_name}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {formatBytes(f.size_bytes)} · {f.uploader_name} ·{" "}
                  {timeAgo(f.created_at)}
                </span>
              </span>
            </a>
            {trash(f, false)}
          </li>
        ))}
      </ul>
    );
  }

  // ---------- grid view ----------
  return (
    <ul className="flex flex-wrap gap-3">
      {files.map((f) => (
        <li key={f.id} className="group relative w-40 animate-fade-in">
          <a
            href={`/api/files/${f.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
            title={`${f.original_name} (${formatBytes(f.size_bytes)})`}
          >
            <Thumb
              file={f}
              className="h-28 w-40 rounded-lg border border-slate-200"
            />
            <span className="mt-1.5 block truncate text-xs font-medium text-slate-700">
              {f.original_name}
            </span>
            <span className="block text-[11px] text-slate-400">
              {formatBytes(f.size_bytes)}
            </span>
          </a>
          {trash(f, true)}
        </li>
      ))}
    </ul>
  );
}
