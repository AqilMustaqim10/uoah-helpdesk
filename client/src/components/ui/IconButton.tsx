// A small square button with only an icon. "label" is read by screen readers and shown as a tooltip.
import type { ButtonHTMLAttributes } from "react";
import { m } from "framer-motion";
import { cn } from "../../lib/cn";

interface Props
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "onAnimationStart" | "onAnimationEnd" | "onDrag" | "onDragStart" | "onDragEnd"
  > {
  label: string;
}

export default function IconButton({
  label,
  className,
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <m.button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      data-motion-button="true"
      whileHover={disabled ? undefined : { scale: 1.04 }}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      transition={{ type: "spring", stiffness: 500, damping: 28 }}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors",
        "hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      {children}
    </m.button>
  );
}
