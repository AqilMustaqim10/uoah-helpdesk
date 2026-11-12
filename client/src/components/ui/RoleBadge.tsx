// A small pill showing ADMIN / IT / USER.
import type { Role } from "../../types";
import { cn } from "../../lib/cn";

const STYLES: Record<Role, string> = {
  ADMIN: "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 ring-indigo-200 dark:ring-indigo-800",
  IT: "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-800",
  USER: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-800",
};

export default function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        STYLES[role],
      )}
    >
      {role}
    </span>
  );
}
