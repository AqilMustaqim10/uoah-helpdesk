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
          "mb-1 block text-sm font-medium text-slate-700",
          labelClassName,
        )}
      >
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        className={cn(
          "h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 transition",
          "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25",
          error ? "border-rose-400" : "border-slate-200",
        )}
        {...rest}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
