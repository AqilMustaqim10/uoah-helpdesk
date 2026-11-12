// Bento grid building blocks.
//   <BentoGrid>  a 6-column grid that collapses to 2 columns, then 1, on small screens
//   <BentoCard>  a card on that grid: white / slate-900, a 1px border that darkens on hover,
//                a soft brand-colored glow, and (when clickable) a springy press.
//
// BentoCard is wrapped in a plain <div data-reveal>. GSAP animates that wrapper on page load,
// while Framer Motion animates the card inside it, so the two never fight over `transform`.
import type { ReactNode } from "react";
import { m } from "framer-motion";
import { cn } from "../../lib/cn";
import { SPRING_TACTILE } from "../../lib/motion";

export function BentoGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The look shared by every card, so non-Bento panels can match it too. */
export const CARD_SURFACE =
  "rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900";

/** Subtle hover feedback: darker border plus a faint glow in the unit's brand color. */
export const CARD_HOVER =
  "transition-[border-color,box-shadow] duration-200 hover:border-slate-400 hover:shadow-[0_10px_32px_-18px_var(--brand)] dark:hover:border-slate-600";

interface BentoCardProps {
  children: ReactNode;
  /** Grid placement goes here, e.g. "col-span-2 lg:col-span-4". */
  className?: string;
  /** Extra classes for the card itself (padding, flex, ...). */
  innerClassName?: string;
  /** Makes the whole card a button with spring hover/press. */
  onClick?: () => void;
  disabled?: boolean;
  "aria-label"?: string;
  /** Section heading read by screen readers when the card is a plain panel. */
  label?: string;
  /** Turn off the load-in reveal (for cards inside drawers and modals). */
  reveal?: boolean;
}

export function BentoCard({
  children,
  className,
  innerClassName,
  onClick,
  disabled,
  label,
  reveal = true,
  ...rest
}: BentoCardProps) {
  const inner = cn(
    "h-full w-full p-4 sm:p-5",
    CARD_SURFACE,
    CARD_HOVER,
    innerClassName,
  );
  const revealProps = reveal ? { "data-reveal": "" } : {};

  if (onClick) {
    return (
      <div className={className} {...revealProps}>
        <m.button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={rest["aria-label"]}
          whileHover={disabled ? undefined : { y: -2 }}
          whileTap={disabled ? undefined : { scale: 0.975 }}
          transition={SPRING_TACTILE}
          className={cn(
            inner,
            "block text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 disabled:cursor-default dark:focus-visible:ring-offset-[#090d16]",
          )}
        >
          {children}
        </m.button>
      </div>
    );
  }

  return (
    <div className={className} {...revealProps}>
      <section aria-label={label} className={inner}>
        {children}
      </section>
    </div>
  );
}

/** Small uppercase heading + optional hint, used at the top of a card. */
export function BentoTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
