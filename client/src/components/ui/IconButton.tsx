// A small square button with only an icon. "label" is read by screen readers and shown as a tooltip.
import type { ReactNode } from "react";
import { m, type HTMLMotionProps } from "framer-motion";
import { cn } from "../../lib/cn";
import { SPRING_TACTILE } from "../../lib/motion";

interface Props extends Omit<HTMLMotionProps<"button">, "children"> {
  label: string;
  children?: ReactNode;
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
      whileHover={disabled ? undefined : { scale: 1.08 }}
      whileTap={disabled ? undefined : { scale: 0.9 }}
      transition={SPRING_TACTILE}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors dark:text-slate-400",
        "hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200",
        className,
      )}
      {...rest}
    >
      {children}
    </m.button>
  );
}
