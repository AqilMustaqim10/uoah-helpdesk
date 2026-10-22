// A labelled multi-line text box. The label can be hidden visually (sr-only) but still read by screen readers.
import { useId, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

interface Props extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "className"
> {
  label: string;
  hideLabel?: boolean;
  error?: string;
  hint?: string;
  className?: string;
}

export default function Textarea({
  label,
  hideLabel,
  error,
  hint,
  className,
  id,
  ...rest
}: Props) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  return (
    <div>
      <label
        htmlFor={fieldId}
        className={cn(
          "mb-1.5 block text-sm font-medium text-slate-700",
          hideLabel && "sr-only",
        )}
      >
        {label}
      </label>
      <textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className={cn(
          "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 transition",
          "placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25",
          error ? "border-rose-400" : "border-slate-200",
          className,
        )}
        {...rest}
      />
      {error ? (
        <p className="mt-1 text-xs text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
