// A pop-up window with a blurred backdrop, animated with Framer Motion.
//  - closes with the X button, the Escape key, or a click on the backdrop; the exit animation plays
//    first (AnimatePresence) and only then is the parent told to remove the window
//  - keeps keyboard focus inside while open, and gives focus back when closed
//  - the page behind does not scroll
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";
import { useOverlay } from "../../hooks/useOverlay";
import { EXIT_FAST, SPRING_SURFACE } from "../../lib/motion";

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

export default function Modal({
  label,
  onClose,
  size = "md",
  children,
}: Props) {
  const [open, setOpen] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  // Always call the newest onClose without restarting effects
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  /** Starts the exit animation; AnimatePresence tells the parent once it is finished. */
  const requestClose = useCallback(() => setOpen(false), []);
  const onKeyDown = useOverlay(panelRef, requestClose);

  return createPortal(
    <AnimatePresence onExitComplete={() => onCloseRef.current()}>
      {open && (
        <m.div
          key="modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: EXIT_FAST }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm"
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
            <m.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={label}
              tabIndex={-1}
              onKeyDown={onKeyDown}
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98, transition: EXIT_FAST }}
              transition={SPRING_SURFACE}
              className={cn(
                "relative w-full rounded-2xl border border-slate-200 bg-white shadow-xl outline-none dark:border-slate-800 dark:bg-slate-900",
                SIZES[size],
              )}
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
          </div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
