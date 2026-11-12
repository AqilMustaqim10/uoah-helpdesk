// Entrance choreography (GSAP).
//
// Anything rendered with a `data-reveal` attribute (Bento cards, table headers, skeleton cards)
// starts invisible (see index.css) and fades up in a staggered wave the moment it appears in the page.
// One observer watches the whole document, so pages, drawers and modals need no extra code:
// just add `data-reveal` to the element.
//
// Lifecycle of the attribute:   ""  (waiting)  ->  "active" (GSAP is animating)  ->  "done"
// Only "done" lifts the CSS hiding rule, and index.css also has a 2-second failsafe, so an element
// can never stay invisible.
import { useLayoutEffect } from "react";
import gsap from "gsap";

const SELECTOR = "[data-reveal]";

function isWaiting(el: Element): el is HTMLElement {
  return el instanceof HTMLElement && el.dataset.reveal === "";
}

export function useRevealObserver(): void {
  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pending = new Set<HTMLElement>();
    let scheduled = false;

    function collect(node: Node) {
      if (!(node instanceof Element)) return;
      if (isWaiting(node)) pending.add(node);
      node.querySelectorAll(SELECTOR).forEach((el) => {
        if (isWaiting(el)) pending.add(el);
      });
    }

    function flush() {
      scheduled = false;
      // Document order = reading order, so the wave runs top-left to bottom-right.
      const els = [...pending]
        .filter((el) => el.isConnected && el.dataset.reveal === "")
        .sort((a, b) =>
          a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
            ? -1
            : 1,
        );
      pending.clear();
      if (els.length === 0) return;

      if (reduce.matches) {
        els.forEach((el) => (el.dataset.reveal = "done"));
        return;
      }

      els.forEach((el) => (el.dataset.reveal = "active"));
      gsap.fromTo(
        els,
        { opacity: 0, y: 18 },
        {
          opacity: 1,
          y: 0,
          duration: 0.55,
          ease: "power3.out",
          // a short wave for a few items, a capped total time for many
          stagger: els.length > 10 ? { amount: 0.6 } : 0.06,
          overwrite: "auto",
          onComplete: () => {
            els.forEach((el) => {
              gsap.set(el, { clearProps: "opacity,transform" });
              el.dataset.reveal = "done";
            });
          },
        },
      );
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      // microtask: runs before the browser paints, so nothing flashes at full opacity
      queueMicrotask(flush);
    }

    const observer = new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach(collect);
      if (pending.size) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Anything already on the page when the app starts
    collect(document.body);
    if (pending.size) schedule();

    return () => {
      observer.disconnect();
      pending.clear();
    };
  }, []);
}
