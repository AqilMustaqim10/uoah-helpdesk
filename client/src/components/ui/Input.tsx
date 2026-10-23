// A labelled text field with an optional error/hint line.
// type="password" automatically gets a show/hide eye button.
import { useId, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "../../lib/cn";

interface Props extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className"
> {
  label: string;
  error?: string;
  hint?: string;
  inputClassName?: string;
  labelClassName?: string;
}

export default function Input({
  label,
  error,
  hint,
  inputClassName,
  labelClassName,
  type = "text",
  id,
  ...rest
}: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-msg`;
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";

  return (
    <div>
      <label
        htmlFor={inputId}
        className={cn(
          "mb-1 block text-sm font-medium text-slate-700",
          labelClassName,
        )}
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type={isPassword && visible ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className={cn(
            "h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 transition",
            "placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25",
            error ? "border-rose-400" : "border-slate-200",
            isPassword && "pr-10",
            inputClassName,
          )}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600"
          >
            {visible ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
      {error ? (
        <p id={messageId} className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
