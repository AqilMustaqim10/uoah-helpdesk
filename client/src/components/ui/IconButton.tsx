// A small square button with only an icon. "label" is read by screen readers and shown as a tooltip.
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export default function IconButton({
  label,
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition",
        "hover:bg-slate-100 hover:text-slate-700 active:scale-95",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
