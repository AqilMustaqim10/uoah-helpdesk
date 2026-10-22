// The left menu. On desktop it can collapse to icons; on phones it slides in over the page.
// The header shows ONLY the unit logo (no text).
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { Branding, TabKey } from "../../types";
import type { TabDef } from "../../lib/nav";
import { cn } from "../../lib/cn";
import BrandMark from "./BrandMark";

interface Props {
  tabs: TabDef[];
  active: TabKey;
  onSelect: (key: TabKey) => void;
  branding: Branding | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
}

export default function Sidebar({
  tabs,
  active,
  onSelect,
  branding,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
}: Props) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-all duration-200",
        "md:static md:z-auto md:translate-x-0",
        mobileOpen ? "translate-x-0 shadow-xl" : "-translate-x-full",
        collapsed ? "md:w-[72px]" : "md:w-64",
      )}
    >
      {/* Header box: the logo fills it */}
      <div
        className={cn(
          "flex shrink-0 items-center border-b border-slate-200 p-3",
          collapsed ? "h-20 md:h-16 md:justify-center" : "h-20",
        )}
      >
        <div
          className={cn(
            "h-full w-full",
            collapsed && "md:aspect-square md:w-auto",
          )}
        >
          <BrandMark branding={branding} />
        </div>
      </div>

      {/* Menu items */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Main">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onSelect(t.key)}
              aria-current={isActive ? "page" : undefined}
              title={collapsed ? t.label : undefined}
              className={cn(
                "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand text-onbrand shadow-sm"
                  : "text-slate-600 hover:bg-slate-100",
                collapsed && "md:justify-center md:px-0",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className={cn("truncate", collapsed && "md:hidden")}>
                {t.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Collapse button (desktop only) */}
      <div className="hidden shrink-0 border-t border-slate-200 p-3 md:block">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-slate-500 transition-colors hover:bg-slate-100",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
