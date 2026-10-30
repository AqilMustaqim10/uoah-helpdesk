// Shows the logo the PDF will carry for the chosen business unit, BEFORE you export.
// The server sends exactly what the PDF will use (the same checked picture, or the same badge),
// so what you see here is what you get, including the case "this unit has no usable logo".
import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { ApiError } from "../../api/client";
import { fetchLogoPreview, type LogoPreview } from "../../api/export";
import Skeleton from "../ui/Skeleton";

const NOTES: Record<NonNullable<LogoPreview["problem"]>, string> = {
  NO_LOGO:
    "This unit has no logo yet, so the PDF shows its code in a colored badge. An administrator can upload a logo in Settings, Branding.",
  UNSUPPORTED_TYPE:
    "This unit's logo is a WebP picture, which PDF reports cannot use, so the PDF shows a badge. Upload a PNG or JPG logo in Settings, Branding.",
  UNREADABLE:
    "This unit's logo file could not be used in the PDF, so a badge is shown. Upload it again as a standard PNG or JPG in Settings, Branding.",
};

/** bu = 'all' or a business unit id (IT always sees their own unit, whatever is asked). */
export default function ReportLogoPreview({ bu }: { bu: string }) {
  const [preview, setPreview] = useState<LogoPreview | null>(null);
  const [error, setError] = useState("");
  const cache = useRef(new Map<string, LogoPreview>()); // per window: reopening the window asks the server again
  const requestId = useRef(0);

  useEffect(() => {
    const cached = cache.current.get(bu);
    if (cached) {
      setPreview(cached);
      setError("");
      return;
    }
    const id = ++requestId.current;
    setPreview(null);
    setError("");
    fetchLogoPreview(bu)
      .then((r) => {
        if (id !== requestId.current) return; // an older answer that arrived late
        cache.current.set(bu, r);
        setPreview(r);
      })
      .catch((err) => {
        if (id === requestId.current)
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load the logo preview.",
          );
      });
  }, [bu]);

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Logo on the PDF
      </p>
      <div className="mt-2 flex items-center gap-3">
        {/* Paper is white, so this box is ALWAYS white (dark mode must not change how the logo looks) */}
        <div
          className="flex h-16 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 p-1"
          style={{ background: "#ffffff" }}
        >
          {error ? (
            <ImageOff className="h-6 w-6 text-slate-400" aria-hidden />
          ) : !preview ? (
            <Skeleton className="h-full w-full" />
          ) : preview.imageDataUrl ? (
            <img
              src={preview.imageDataUrl}
              alt={`Logo of ${preview.unit}`}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span
              className="flex h-full items-center rounded-md px-4 text-lg font-bold"
              style={{ background: preview.badgeColor, color: "#ffffff" }}
            >
              {preview.badgeText}
            </span>
          )}
        </div>

        <div className="min-w-0 text-sm" aria-live="polite">
          {error ? (
            <p className="text-xs text-rose-600">{error}</p>
          ) : preview ? (
            <>
              <p className="truncate font-medium text-slate-900">
                {preview.unit}
              </p>
              <p className="text-xs text-slate-500">
                {preview.problem
                  ? NOTES[preview.problem]
                  : "This logo appears at the top right of the PDF."}
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-500">Loading the logo…</p>
          )}
        </div>
      </div>
    </div>
  );
}
