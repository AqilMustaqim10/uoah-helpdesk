// Draws the current toast (bottom-right; full width on phones).
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import type { ToastItem, ToastKind } from "../../types";
import { cn } from "../../lib/cn";

const STYLES: Record<ToastKind, string> = {
  success: "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200",
  error: "border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 text-rose-800 dark:text-rose-200",
  info: "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200",
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
  const reduceMotion = useReducedMotion();

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex justify-end sm:inset-x-auto sm:right-4"
    >
      <AnimatePresence mode="wait">
        {toast && (
        <m.div
          key={toast.id}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
          role={toast.kind === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg",
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
        </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
