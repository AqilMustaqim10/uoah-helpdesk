// The Settings tab (ADMIN only): branding for each business unit.
import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { unitsApi } from "../api/units";
import { cn } from "../lib/cn";
import type { UnitBranding, User } from "../types";
import BrandingEditor from "../components/settings/BrandingEditor";
import FormError from "../components/ui/FormError";
import Skeleton from "../components/ui/Skeleton";

export default function SettingsPage({ user }: { user: User }) {
  const [units, setUnits] = useState<UnitBranding[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    unitsApi
      .list()
      .then((r) => {
        if (cancelled) return;
        setUnits(r.units);
        // Start with your own unit, otherwise the first one
        setSelectedId(
          (prev) =>
            prev ??
            r.units.find((u) => u.id === user.business_unit_id)?.id ??
            r.units[0]?.id ??
            null,
        );
      })
      .catch(
        (err) =>
          !cancelled &&
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load the settings.",
          ),
      );
    return () => {
      cancelled = true;
    };
  }, [user.business_unit_id]);

  if (error) return <FormError message={error} />;

  if (!units) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading settings">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const selected = units.find((u) => u.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          Business unit branding
        </h2>
        <p className="text-sm text-slate-500">
          Choose a unit, then set its logo, color and display text.
        </p>
      </div>

      <div
        className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 py-0.5"
        role="group"
        aria-label="Business unit"
      >
        {units.map((u) => {
          const active = u.id === selectedId;
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => setSelectedId(u.id)}
              aria-pressed={active}
              title={u.name}
              className={cn(
                "inline-flex h-8 shrink-0 items-center rounded-full px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-brand text-onbrand shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {u.code}
            </button>
          );
        })}
      </div>

      {selected && (
        // key={selected.id}: choosing another unit starts the editor fresh
        <BrandingEditor
          key={selected.id}
          unit={selected}
          onSaved={(unit) =>
            setUnits((list) =>
              list ? list.map((u) => (u.id === unit.id ? unit : u)) : list,
            )
          }
        />
      )}
    </div>
  );
}
