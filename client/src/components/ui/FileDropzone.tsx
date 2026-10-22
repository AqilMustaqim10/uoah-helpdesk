// A "drop files here or click to browse" area. It only hands the chosen files to the parent;
// the parent decides what to do with them (upload now, or keep them until Send).
import { useRef, useState, type DragEvent } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { ACCEPT } from "../../lib/files";
import { cn } from "../../lib/cn";

interface Props {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** Shows a spinner (for example while uploading). */
  busy?: boolean;
  /** A shorter version used under the reply box. */
  compact?: boolean;
  label?: string;
}

export default function FileDropzone({
  onFiles,
  disabled,
  busy,
  compact,
  label = "Drop pictures or PDFs here, or click to browse",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false); // true while a file is being dragged over the area
  const blocked = !!(disabled || busy);

  function pick(list: FileList | null) {
    if (list && list.length > 0) onFiles(Array.from(list));
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    if (!blocked) pick(e.dataTransfer.files);
  }

  return (
    <div
      role="button"
      tabIndex={blocked ? -1 : 0}
      aria-disabled={blocked}
      aria-label={label}
      onClick={() => !blocked && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !blocked) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!blocked) setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setOver(false);
      }}
      onDrop={onDrop}
      className={cn(
        "flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed text-slate-500 transition-colors",
        compact ? "px-3 py-2 text-xs" : "flex-col px-4 py-6 text-sm",
        over
          ? "border-brand bg-brand/5 text-brand"
          : "border-slate-300 hover:border-slate-400 hover:bg-slate-50",
        blocked && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()} // otherwise the click would bubble up and open the window twice
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = ""; // lets the same file be chosen again later
        }}
      />
      {busy ? (
        <Loader2
          className={cn("animate-spin", compact ? "h-4 w-4" : "h-6 w-6")}
          aria-hidden
        />
      ) : (
        <UploadCloud className={compact ? "h-4 w-4" : "h-6 w-6"} aria-hidden />
      )}
      <span>{busy ? "Uploading…" : label}</span>
      {!compact && !busy && (
        <span className="text-xs text-slate-400">
          JPG, PNG, GIF, WebP or PDF, up to 10 MB each
        </span>
      )}
    </div>
  );
}
