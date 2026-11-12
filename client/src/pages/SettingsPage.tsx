// The Settings tab (ADMIN only). Three sections: Branding, Departments, and the Audit log.
import { useState } from "react";
import { cn } from "../lib/cn";
import type { User } from "../types";
import AuditLogViewer from "../components/settings/AuditLogViewer";
import BrandingSettings from "../components/settings/BrandingSettings";
import DepartmentsSettings from "../components/settings/DepartmentsSettings";

type Section = "branding" | "departments" | "audit";

const SECTIONS: Array<{ key: Section; label: string }> = [
  { key: "branding", label: "Branding" },
  { key: "departments", label: "Departments" },
  { key: "audit", label: "Audit log" },
];

export default function SettingsPage({ user }: { user: User }) {
  const [section, setSection] = useState<Section>("branding");

  return (
    <div className="space-y-5">
      <div
        className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-0.5"
        role="group"
        aria-label="Settings section"
      >
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            aria-pressed={section === s.key}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors active:scale-[0.97]",
              section === s.key
                ? "bg-brand text-onbrand shadow-sm"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* key={section}: switching replays a soft fade-in */}
      <div key={section} className="animate-fade-in">
        {section === "branding" ? (
          <BrandingSettings user={user} />
        ) : section === "departments" ? (
          <DepartmentsSettings />
        ) : (
          <AuditLogViewer />
        )}
      </div>
    </div>
  );
}
