// Draws the current toast (bottom-right; full width on phones).
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import type { ToastItem, ToastKind } from "../../types";
import { cn } from "../../lib/cn";

const STYLES: Record<ToastKind, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  info: "border-slate-200 bg-white text-slate-800",
};

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export default function ToastViewport({
  toast,
  onClose,
}: {
  toast: ToastItem | null;
  onClose: () => void;
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex justify-end sm:inset-x-auto sm:right-4"
    >
      {toast && (
        // key={toast.id}: a new toast re-plays the slide-in animation
        <div
          key={toast.id}
          role={toast.kind === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex w-full max-w-sm animate-slide-in items-start gap-3 rounded-xl border px-4 py-3 shadow-lg",
            STYLES[toast.kind],
          )}
        >
          {(() => {
            const Icon = ICONS[toast.kind];
            return <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />;
          })()}
          <p className="flex-1 text-sm">{toast.message}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss message"
            className="-m-1 rounded p-1 opacity-70 transition hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
