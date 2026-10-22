// Files already saved on a ticket or an article: picture thumbnails and PDF chips.
//  - click opens the file in a new tab (the server checks you may see it)
//  - the delete button needs two clicks (the first one turns it red)
// New in step D: it works for any kind of file list (hrefBase says where the files are served from).
import { useEffect, useState } from "react";
import { FileText, ImageOff, Loader2, Trash2 } from "lucide-react";
import { formatBytes, isImage } from "../../lib/files";
import { cn } from "../../lib/cn";

/** The smallest description of a file this grid needs (ticket and article files both fit). */
export interface GridFile {
  id: number;
  original_name: string;
  mime: string;
  size_bytes: number;
}

interface Props<T extends GridFile> {
  files: T[];
  canDelete: (file: T) => boolean;
  onDelete: (file: T) => Promise<void>;
  /** Where files are served from. Tickets use the default; the knowledge base passes '/api/kb/files'. */
  hrefBase?: string;
}

/** A picture thumbnail. If it cannot load, a small placeholder icon is shown instead. */
function ImageThumb({ file, hrefBase }: { file: GridFile; hrefBase: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400">
      <ImageOff className="h-6 w-6" aria-hidden />
    </div>
  ) : (
    <img
      src={`${hrefBase}/${file.id}`}
      alt={file.original_name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-20 w-20 rounded-lg border border-slate-200 object-cover"
    />
  );
}

export default function AttachmentGrid<T extends GridFile>({
  files,
  canDelete,
  onDelete,
  hrefBase = "/api/files",
}: Props<T>) {
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // The "confirm" state resets by itself after 4 seconds
  useEffect(() => {
    if (confirmId === null) return;
    const t = window.setTimeout(() => setConfirmId(null), 4000);
    return () => window.clearTimeout(t);
  }, [confirmId]);

  async function remove(file: T) {
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

  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f) => {
        const deletable = canDelete(f);
        const confirming = confirmId === f.id;
        const busy = busyId === f.id;

        const deleteButton = deletable && (
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
              "absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full shadow transition",
              "opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100",
              confirming
                ? "bg-rose-600 text-onbrand opacity-100"
                : "bg-white text-slate-600 hover:text-rose-600",
            )}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        );

        return (
          <li key={f.id} className="group relative animate-fade-in">
            {isImage(f.mime) ? (
              <a
                href={`${hrefBase}/${f.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
                title={`${f.original_name} (${formatBytes(f.size_bytes)})`}
              >
                <ImageThumb file={f} hrefBase={hrefBase} />
              </a>
            ) : (
              <a
                href={`${hrefBase}/${f.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-20 w-44 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 pr-8 transition hover:bg-slate-50"
                title={f.original_name}
              >
                <FileText
                  className="h-6 w-6 shrink-0 text-rose-500"
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-700">
                    {f.original_name}
                  </span>
                  <span className="block text-xs text-slate-400">
                    PDF, {formatBytes(f.size_bytes)}
                  </span>
                </span>
              </a>
            )}
            {deleteButton}
          </li>
        );
      })}
    </ul>
  );
}
