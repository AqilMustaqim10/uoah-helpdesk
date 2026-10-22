// The unit's logo filling its box. If there is no logo (or it fails to load),
// it shows a colored badge with the first letter instead.
import { useEffect, useState } from "react";
import type { Branding } from "../../types";

export default function BrandMark({ branding }: { branding: Branding | null }) {
  const [failed, setFailed] = useState(false);

  // A new logo version (or a different unit) gets a fresh try
  useEffect(() => {
    setFailed(false);
  }, [branding?.unitId, branding?.logoVersion]);

  if (branding?.hasLogo && !failed) {
    return (
      <img
        // ?v= changes whenever a new logo is uploaded, so the browser never shows an old one
        src={`/api/units/${branding.unitId}/logo?v=${branding.logoVersion}`}
        alt={branding.brandText}
        onError={() => setFailed(true)}
        className="h-full w-full object-contain"
      />
    );
  }

  const letter =
    (branding?.brandText ?? "H").trim().charAt(0).toUpperCase() || "H";
  return (
    <div
      className="flex h-full w-full items-center justify-center rounded-xl bg-brand text-xl font-semibold text-onbrand"
      aria-label={branding?.brandText ?? "Helpdesk"}
    >
      {letter}
    </div>
  );
}
