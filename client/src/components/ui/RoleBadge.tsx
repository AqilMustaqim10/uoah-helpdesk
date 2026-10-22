// A small pill showing ADMIN / IT / USER.
import type { Role } from "../../types";
import { cn } from "../../lib/cn";

const STYLES: Record<Role, string> = {
  ADMIN: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  IT: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  USER: "bg-slate-100 text-slate-600 ring-slate-200",
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
