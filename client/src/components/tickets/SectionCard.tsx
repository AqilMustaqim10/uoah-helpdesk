// A white card with a small header row: an icon, an uppercase title, an optional count bubble,
// and an optional control on the right (for example the grid/list switch). Used for every section of the ticket window.
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  /** A small number next to the title (0 or empty shows nothing). */
  count?: number;
  /** A control shown at the right end of the header. */
  action?: ReactNode;
  children: ReactNode;
}

export default function SectionCard({
  icon: Icon,
  title,
  count,
  action,
  children,
}: Props) {
  return (
    <section
      aria-label={title}
      className="rounded-xl border border-slate-200 bg-white"
    >
      <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <Icon className="h-4 w-4 shrink-0 text-brand" aria-hidden />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
          {title}
        </h3>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
            {count}
          </span>
        )}
        {action && <div className="ml-auto">{action}</div>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
