// A round badge with a person's initials. The color depends on the name, so it is stable.
import { initials } from "../../lib/format";
import { cn } from "../../lib/cn";

const COLORS = [
  "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300",
  "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300",
  "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300",
  "bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300",
  "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200",
];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}

interface Props {
  name: string;
  size?: "sm" | "md";
}

export default function Avatar({ name, size = "md" }: Props) {
  return (
    <span
      title={name}
      aria-label={name}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs",
        colorFor(name),
      )}
    >
      {initials(name)}
    </span>
  );
}
