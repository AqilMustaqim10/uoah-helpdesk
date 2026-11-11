// A pop-up window with a blurred backdrop.
//  - closes with the X button, the Escape key, or a click on the backdrop (with a short fade-out)
//  - keeps keyboard focus inside while open, and gives focus back when closed
//  - the page behind does not scroll
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { m, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

interface Props {
  /** Read aloud by screen readers. */
  label: string;
  onClose: () => void;
  beforeClose?: () => boolean;
  size?: "md" | "lg" | "wide" | "xl";
  presentation?: "modal" | "drawer";
  layoutId?: string;
  children: ReactNode;
}

const SIZES = {
  md: "max-w-lg",
  lg: "max-w-2xl",
  wide: "max-w-3xl",
  xl: "max-w-5xl",
};
const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function Modal({
  label,
  onClose,
  beforeClose,
  size = "md",
  presentation = "modal",
  layoutId,
  children,
}: Props) {
  const reduceMotion = useReducedMotion();
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | undefined>(undefined);

  // Always call the newest onClose without restarting effects
  const onCloseRef = useRef(onClose);
  const beforeCloseRef = useRef(beforeClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    beforeCloseRef.current = beforeClose;
  }, [beforeClose]);

  /** Plays the fade-out, then tells the parent to remove the window. */
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    if (beforeCloseRef.current && !beforeCloseRef.current()) return;
    closingRef.current = true;
    setClosing(true);
    timerRef.current = window.setTimeout(
      () => onCloseRef.current(),
      reduceMotion ? 0 : 220,
    );
  }, [reduceMotion]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  // Lock page scroll, move focus into the window, and restore both on close
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      requestClose();
      return;
    }
    // Tab / Shift+Tab cycle inside the window
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: closing ? 0 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
      className={cn(
        "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm",
        presentation === "drawer" ? "overflow-hidden" : "overflow-y-auto",
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose(); // click on the dark area
      }}
    >
      {/* min-h-full + items-center keeps small windows centered and tall ones scrollable */}
      <m.div
        className={cn(
          "flex min-h-full",
          presentation === "drawer"
            ? "items-stretch justify-end"
            : "items-center justify-center p-4 sm:p-6",
        )}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) requestClose();
        }}
      >
        <m.div
          ref={panelRef}
          layoutId={layoutId}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          initial={
            reduceMotion
              ? false
              : presentation === "drawer"
                ? { x: "100%" }
                : { opacity: 0, y: 8, scale: 0.97 }
          }
          animate={
            closing
              ? reduceMotion
                ? { opacity: 0 }
                : presentation === "drawer"
                  ? { x: "100%" }
                  : { opacity: 0, y: 8, scale: 0.97 }
              : presentation === "drawer"
                ? { x: 0 }
                : { opacity: 1, y: 0, scale: 1 }
          }
          exit={
            reduceMotion
              ? { opacity: 0 }
              : presentation === "drawer"
                ? { x: "100%" }
                : { opacity: 0, y: 8, scale: 0.97 }
          }
          transition={
            reduceMotion
              ? { duration: 0 }
              : presentation === "drawer"
                ? { type: "spring", stiffness: 280, damping: 32 }
                : { type: "spring", stiffness: 360, damping: 30 }
          }
          className={cn(
            "relative w-full rounded-2xl border border-slate-200 bg-white shadow-xl outline-none",
            presentation === "drawer"
              ? "h-dvh max-w-none rounded-none sm:max-w-3xl sm:rounded-l-2xl"
              : SIZES[size],
          )}
        >
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
          {children}
        </m.div>
      </m.div>
    </m.div>,
    document.body,
  );
}
