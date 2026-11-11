// The left menu. On desktop it can collapse to icons; on phones it slides in over the page.
// The header shows ONLY the unit logo (no text).
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { m, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
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
  onCloseMobile: () => void;
}

export default function Sidebar({
  tabs,
  active,
  onSelect,
  branding,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}: Props) {
  const reduceMotion = useReducedMotion();
  const [isMobile, setIsMobile] = useState(() =>
    window.matchMedia("(max-width: 767px)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsMobile(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseMobile();
        document.getElementById("mobile-menu-button")?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen, onCloseMobile]);

  return (
    <m.aside
      id="mobile-sidebar"
      inert={isMobile && !mobileOpen}
      initial={false}
      animate={{ x: isMobile && !mobileOpen ? "-100%" : 0 }}
      layout={!reduceMotion}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 360, damping: 34 }
      }
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-[width] duration-200",
        "md:sticky md:top-0 md:h-dvh md:z-auto",
        mobileOpen && isMobile && "shadow-xl",
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
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" data-lenis-prevent aria-label="Main">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = t.key === active;
          return (
            <m.button
              key={t.key}
              type="button"
              data-motion-button="true"
              onClick={() => onSelect(t.key)}
              whileHover={reduceMotion ? undefined : { scale: 1.02 }}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              transition={{ type: "spring", stiffness: 480, damping: 30 }}
              aria-current={isActive ? "page" : undefined}
              title={collapsed ? t.label : undefined}
              className={cn(
                "relative isolate flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                isActive ? "text-onbrand" : "text-slate-600 hover:bg-slate-100",
                collapsed && "md:justify-center md:px-0",
              )}
            >
              {isActive &&
                (reduceMotion ? (
                  <span className="absolute inset-0 -z-10 rounded-lg bg-brand shadow-sm" />
                ) : (
                  <m.span
                    layoutId="sidebar-active-tab"
                    className="absolute inset-0 -z-10 rounded-lg bg-brand shadow-sm"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                ))}
              <Icon className="relative h-5 w-5 shrink-0" aria-hidden />
              <span
                className={cn("relative truncate", collapsed && "md:hidden")}
              >
                {t.label}
              </span>
            </m.button>
          );
        })}
      </nav>

      {/* Collapse button (desktop only) */}
      <div className="hidden shrink-0 border-t border-slate-200 p-3 md:block">
        <m.button
          type="button"
          data-motion-button="true"
          onClick={onToggleCollapsed}
          whileHover={reduceMotion ? undefined : { scale: 1.02 }}
          whileTap={reduceMotion ? undefined : { scale: 0.98 }}
          transition={{ type: "spring", stiffness: 480, damping: 30 }}
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
        </m.button>
      </div>
    </m.aside>
  );
}
