// A labelled dropdown, styled like Input.
import { useId, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

interface Props extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "className"
> {
  label: string;
  error?: string;
  labelClassName?: string;
  children: ReactNode;
}

export default function Select({
  label,
  error,
  labelClassName,
  id,
  children,
  ...rest
}: Props) {
  const autoId = useId();
  const selectId = id ?? autoId;

  return (
    <div>
      <label
        htmlFor={selectId}
        className={cn(
          "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200",
          labelClassName,
        )}
      >
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        className={cn(
          "h-10 w-full rounded-lg border bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 transition",
          "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25",
          error ? "border-rose-400 dark:border-rose-600" : "border-slate-200 dark:border-slate-800",
        )}
        {...rest}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
