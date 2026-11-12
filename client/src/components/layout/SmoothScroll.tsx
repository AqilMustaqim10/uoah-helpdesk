// The app's main scroll area, with Lenis momentum scrolling.
//
// The page does not scroll as a whole here: the shell is exactly the window's height and only <main>
// scrolls. So Lenis is attached to <main> (wrapper) and its single child (content), not to the window.
//
// - skipped for people who asked for reduced motion (they get normal browser scrolling)
// - scrollable areas INSIDE the page (text boxes, code blocks, dropdown lists) keep their own native
//   scrolling, otherwise the wheel would scroll the page instead
// - `resetKey` jumps back to the top when the tab changes
// - overlays can pause it through useLenis()?.stop() / .start()
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { m } from "framer-motion";
import { cn } from "../../lib/cn";

const LenisContext = createContext<Lenis | null>(null);

/** The running Lenis instance (null while it is off, e.g. with reduced motion). */
export const useLenis = (): Lenis | null => useContext(LenisContext);

/** True for an element that scrolls on its own (and actually has something to scroll). */
function scrollsByItself(node: HTMLElement, wrapper: HTMLElement): boolean {
  if (node === wrapper) return false;
  const { overflowY } = getComputedStyle(node);
  return (
    (overflowY === "auto" || overflowY === "scroll") &&
    node.scrollHeight > node.clientHeight + 1
  );
}

interface Props {
  children: ReactNode;
  className?: string;
  /** Changing this scrolls back to the top. */
  resetKey?: string;
}

export default function SmoothScroll({ children, className, resetKey }: Props) {
  const wrapperRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [lenis, setLenis] = useState<Lenis | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!wrapper || !content) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const instance = new Lenis({
      wrapper,
      content,
      autoRaf: true,
      lerp: 0.11,
      wheelMultiplier: 1,
      smoothWheel: true,
      prevent: (node) => scrollsByItself(node, wrapper),
    });
    setLenis(instance);
    return () => {
      instance.destroy();
      setLenis(null);
    };
  }, []);

  // New tab -> start at the top
  useEffect(() => {
    if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
    else wrapperRef.current?.scrollTo({ top: 0 });
  }, [resetKey, lenis]);

  return (
    <LenisContext.Provider value={lenis}>
      {/* layoutScroll tells Framer Motion this box scrolls, so shared-layout morphs
          (ticket row -> drawer) stay correct when the list is scrolled. */}
      <m.main
        ref={wrapperRef}
        layoutScroll
        className={cn("flex-1 overflow-y-auto", className)}
      >
        <div ref={contentRef}>{children}</div>
      </m.main>
    </LenisContext.Provider>
  );
}
