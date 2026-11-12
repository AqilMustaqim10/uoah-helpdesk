// The one button style used everywhere: primary (brand color), secondary, ghost.
// Springs up slightly on hover and presses in on click (Framer Motion).
import type { ReactNode } from "react";
import { m, type HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";
import { SPRING_TACTILE } from "../../lib/motion";

interface Props extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

const VARIANTS = {
  primary: "bg-brand text-onbrand shadow-sm hover:brightness-110",
  secondary:
    "border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-950",
  ghost:
    "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
};

const SIZES = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: Props) {
  const inactive = disabled || loading;
  return (
    <m.button
      type={type}
      disabled={inactive}
      whileHover={inactive ? undefined : { y: -1 }}
      whileTap={inactive ? undefined : { scale: 0.97 }}
      transition={SPRING_TACTILE}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 ease-out",
        "disabled:cursor-not-allowed disabled:opacity-60",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        // A button that is busy keeps a small inline spinner: it is progress of an action, not placeholder content.
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        icon
      )}
      {children}
    </m.button>
  );
}
