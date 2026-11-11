import { useEffect } from "react";
import Lenis from "lenis";
import { useReducedMotion } from "framer-motion";
import { loadGsap } from "../../lib/gsapRuntime";

export default function SmoothScroll() {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion !== false) return;

    let cancelled = false;
    let lenis: Lenis | undefined;
    let removeTicker: (() => void) | undefined;
    void loadGsap().then(({ gsap, ScrollTrigger }) => {
      if (cancelled) return;

      const instance = new Lenis({ autoRaf: false, smoothWheel: true });
      lenis = instance;
      const onTick = (time: number) => instance.raf(time * 1000);
      instance.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(onTick);
      removeTicker = () => gsap.ticker.remove(onTick);
    });
    return () => {
      cancelled = true;
      removeTicker?.();
      lenis?.destroy();
    };
  }, [reduceMotion]);

  return null;
}
