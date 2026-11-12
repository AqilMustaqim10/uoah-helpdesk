// A side drawer that slides in from the right (Framer Motion + AnimatePresence).
//
// Shared-layout morph: pass `morphId` (e.g. "ticket-surface-12") and, when an element with the same
// layoutId is on the page (the ticket row's surface), the drawer GROWS out of that row instead of
// sliding in, then the content fades in. Closing reverses it. If no row is on the page (opened from
// the dashboard or the command palette), or the person prefers reduced motion, it just slides.
//
// Same rules as <Modal>: Escape / backdrop / X close it, focus is kept inside, the exit animation
// plays before the parent is told to remove it.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";
import { useOverlay } from "../../hooks/useOverlay";
import { EXIT_FAST, SPRING_SURFACE } from "../../lib/motion";

interface Props {
  /** Read aloud by screen readers. */
  label: string;
  onClose: () => void;
  /** layoutId to morph from (see above). */
  morphId?: string;
  size?: "lg" | "xl";
  children: ReactNode;
}

const SIZES = { lg: "sm:max-w-2xl", xl: "sm:max-w-3xl" };

/** Attribute the row's surface carries, so the drawer can tell whether a morph partner exists. */
export const MORPH_ATTR = "data-morph";

export default function Drawer({
  label,
  onClose,
  morphId,
  size = "xl",
  children,
}: Props) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  // Morph only when there is something to morph from. Decided once, when the drawer opens.
  const [morph] = useState(
    () =>
      !!morphId &&
      !reduceMotion &&
      !!document.querySelector(`[${MORPH_ATTR}="${morphId}"]`),
  );
  // While morphing, the content waits (it would be stretched) and appears when the surface lands
  const [ready, setReady] = useState(!morph);
  useEffect(() => {
    if (ready) return;
    const t = window.setTimeout(() => setReady(true), 600); // safety net
    return () => window.clearTimeout(t);
  }, [ready]);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const requestClose = useCallback(() => {
    setReady(false); // content fades first, then the surface travels back
    setOpen(false);
  }, []);
  const onKeyDown = useOverlay(panelRef, requestClose);

  return createPortal(
    <AnimatePresence onExitComplete={() => onCloseRef.current()}>
      {open && (
        <m.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: EXIT_FAST }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) requestClose();
          }}
        />
      )}
      {open && (
        <m.div
          key="panel"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          layoutId={morph ? morphId : undefined}
          onLayoutAnimationComplete={() => setReady(true)}
          initial={morph ? false : { x: "100%" }}
          animate={{ x: 0 }}
          exit={morph ? undefined : { x: "100%", transition: EXIT_FAST }}
          transition={SPRING_SURFACE}
          // inline radii so Framer can animate them during the morph (row: square -> drawer: rounded left)
          style={{
            borderTopLeftRadius: 16,
            borderBottomLeftRadius: 16,
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
          }}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl outline-none dark:border-slate-800 dark:bg-slate-900",
            SIZES[size],
          )}
        >
          <m.div
            animate={{ opacity: ready ? 1 : 0 }}
            transition={{ duration: ready ? 0.2 : 0.1 }}
            className="relative flex min-h-0 flex-1 flex-col"
          >
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
            {children}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
