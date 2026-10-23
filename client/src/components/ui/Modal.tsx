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
import { X } from "lucide-react";
import "./modal.css";
import { cn } from "../../lib/cn";

interface Props {
  /** Read aloud by screen readers. */
  label: string;
  onClose: () => void;
  size?: "md" | "lg" | "wide" | "xl";
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
  size = "md",
  children,
}: Props) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | undefined>(undefined);

  // Always call the newest onClose without restarting effects
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  /** Plays the fade-out, then tells the parent to remove the window. */
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    timerRef.current = window.setTimeout(() => onCloseRef.current(), 150);
  }, []);

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
    <div
      className={cn(
        "fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm",
        closing ? "modal-backdrop-out" : "modal-backdrop-in",
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose(); // click on the dark area
      }}
    >
      {/* min-h-full + items-center keeps small windows centered and tall ones scrollable */}
      <div
        className="flex min-h-full items-center justify-center p-4 sm:p-6"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) requestClose();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className={cn(
            "relative w-full rounded-2xl border border-slate-200 bg-white shadow-xl outline-none",
            SIZES[size],
            closing ? "modal-panel-out" : "modal-panel-in",
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
        </div>
      </div>
    </div>,
    document.body,
  );
}
