// Behavior shared by pop-up windows and side drawers:
//  - keyboard focus moves into the panel when it opens and goes back to where it was when it closes
//  - Escape closes it; Tab / Shift+Tab stay inside it
//  - the page behind does not scroll
import { useCallback, useEffect, type KeyboardEvent, type RefObject } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useOverlay(
  panelRef: RefObject<HTMLElement | null>,
  requestClose: () => void,
) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [panelRef]);

  /** Put this on the panel's onKeyDown. */
  return useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
        return;
      }
      const panel = panelRef.current;
      if (e.key !== "Tab" || !panel) return;
      const items = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [panelRef, requestClose],
  );
}
