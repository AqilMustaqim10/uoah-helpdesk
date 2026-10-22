// Files the person has chosen but not sent yet, with a small preview and a remove button.
import { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import { formatBytes } from "../../lib/files";

/** A small picture preview (or a document icon for PDFs). */
function Thumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u); // free the memory when the preview goes away
  }, [file]);

  return url ? (
    <img
      src={url}
      alt=""
      className="h-10 w-10 shrink-0 rounded-md object-cover"
    />
  ) : (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
      <FileText className="h-5 w-5" aria-hidden />
    </div>
  );
}

interface Props {
  files: File[];
  onRemove: (index: number) => void;
}

export default function PendingFileList({ files, onRemove }: Props) {
  if (files.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {files.map((f, i) => (
        <li
          key={`${f.name}-${f.size}-${i}`}
          className="flex animate-fade-in items-center gap-3 rounded-lg border border-slate-200 bg-white px-2 py-1.5"
        >
          <Thumb file={f} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-slate-700">{f.name}</p>
            <p className="text-xs text-slate-400">{formatBytes(f.size)}</p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label={`Remove ${f.name}`}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
