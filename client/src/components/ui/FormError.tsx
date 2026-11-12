// A red message box shown above a form's button. Shows nothing when there is no message.
import { AlertCircle } from "lucide-react";

export default function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex animate-fade-in items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 px-3 py-2 text-sm text-rose-700 dark:text-rose-300"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
