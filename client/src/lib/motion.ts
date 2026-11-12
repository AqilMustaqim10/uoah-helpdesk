// Shared motion settings, so every interactive element has the same "feel".
import type { Transition } from "framer-motion";

/** Snappy spring for small controls (buttons, icon buttons, rows). */
export const SPRING_TACTILE: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 30,
  mass: 0.6,
};

/** Softer spring for larger surfaces (drawers, modals, cards). */
export const SPRING_SURFACE: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 36,
  mass: 0.9,
};

/** Short tween used when something leaves (springs feel slow on exit). */
export const EXIT_FAST: Transition = { duration: 0.14, ease: "easeIn" };

/** Props to spread on an `m.*` element to give it the tactile hover/press feel. */
export const TACTILE = {
  whileHover: { y: -1 },
  whileTap: { scale: 0.97 },
  transition: SPRING_TACTILE,
} as const;

/** The layoutId shared between a ticket row and the drawer of the same ticket (they morph into each other). */
export const ticketSurfaceId = (id: number) => `ticket-surface-${id}`;
