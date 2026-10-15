// Edit one business unit's branding: logo, brand color, display text, with a live preview.
// Every rule is checked here for instant feedback, and AGAIN on the server (which has the final say).
import { useRef, useState, type CSSProperties } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { ApiError } from "../../api/client";
import { unitsApi } from "../../api/units";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { contrastWithWhite, isHexColor } from "../../lib/color";
import type { Branding, UnitBranding } from "../../types";
import BrandMark from "../layout/BrandMark";
import Button from "../ui/Button";
import FormError from "../ui/FormError";
import Input from "../ui/Input";

interface Props {
  unit: UnitBranding;
  onSaved: (unit: UnitBranding) => void;
}

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_LOGO_BYTES = 1024 * 1024; // 1 MB

export default function BrandingEditor({ unit, onSaved }: Props) {
  const toast = useToast();
  const { refresh } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [color, setColor] = useState(unit.brand_color);
  const [text, setText] = useState(unit.brand_text);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState("");

  // ---- instant checks ----
  const validColor = isHexColor(color);
  const ratio = validColor ? contrastWithWhite(color) : 0;
  const colorOk = validColor && ratio >= 4.5;
  const trimmed = text.trim();
  const textOk =
    trimmed.length >= 2 && trimmed.length <= 40 && !/[<>]/.test(trimmed);
  const changed =
    color.toUpperCase() !== unit.brand_color.toUpperCase() ||
    trimmed !== unit.brand_text;

  const colorError = !validColor
    ? "Use the format #RRGGBB, for example #0F766E."
    : !colorOk
      ? `Too light for white text (${ratio.toFixed(1)}:1). It needs at least 4.5:1.`
      : undefined;
  const textError = textOk
    ? undefined
    : "Use 2 to 40 characters, without < or >.";

  /** What the preview shows (it follows what you type, before you save). */
  const preview: Branding = {
    unitId: unit.id,
    code: unit.code,
    name: unit.name,
    brandColor: colorOk ? color : unit.brand_color,
    brandText: trimmed || unit.name,
    logoVersion: unit.logo_version,
    hasLogo: unit.has_logo,
  };

  async function save() {
    if (!colorOk || !textOk || saving) return;
    setSaving(true);
    setError("");
    try {
      const r = await unitsApi.saveBranding(
        unit.id,
        color.toUpperCase(),
        trimmed,
      );
      onSaved(r.unit);
      await refresh(); // your own sidebar and buttons update straight away if this is your unit
      toast.success("Branding saved");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    if (!LOGO_TYPES.includes(file.type)) {
      toast.error("The logo must be a PNG, JPG or WebP picture.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("The logo must be smaller than 1 MB.");
      return;
    }
    setLogoBusy(true);
    try {
      const r = await unitsApi.uploadLogo(unit.id, file);
      onSaved(r.unit);
      await refresh();
      toast.success("Logo updated");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not upload the logo.",
      );
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    setLogoBusy(true);
    try {
      const r = await unitsApi.removeLogo(unit.id);
      onSaved(r.unit);
      await refresh();
      toast.success("Logo removed");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not remove the logo.",
      );
    } finally {
      setLogoBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* Controls */}
      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            {unit.name}
          </h3>
          <p className="text-sm text-slate-500">
            These settings apply to everyone in {unit.code}.
          </p>
        </div>

        <FormError message={error} />

        {/* Logo */}
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Logo</p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-20 w-40 rounded-lg border border-slate-200 bg-white p-2">
              <BrandMark branding={preview} />
            </div>
            <div className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = ""; // lets the same file be chosen again later
                  if (f) void uploadLogo(f);
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                icon={<ImagePlus className="h-4 w-4" />}
                loading={logoBusy}
                onClick={() => fileRef.current?.click()}
              >
                {unit.has_logo ? "Replace logo" : "Upload logo"}
              </Button>
              {unit.has_logo && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 className="h-4 w-4" />}
                  disabled={logoBusy}
                  onClick={() => void removeLogo()}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            PNG, JPG or WebP, up to 1 MB. Without a logo the sidebar shows a
            colored letter.
          </p>
        </div>

        {/* Color */}
        <div>
          <label htmlFor="brand-color-hex" className="sr-only">
            Brand color
          </label>
          <p className="mb-1.5 text-sm font-medium text-slate-700">
            Brand color
          </p>
          <div className="flex items-start gap-3">
            <input
              type="color"
              aria-label="Pick a brand color"
              value={validColor ? color.toLowerCase() : "#2563eb"}
              onChange={(e) => setColor(e.target.value.toUpperCase())}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
            />
            <div className="flex-1">
              <Input
                id="brand-color-hex"
                label="Hex code"
                value={color}
                onChange={(e) => setColor(e.target.value.trim())}
                maxLength={7}
                error={color ? colorError : "Enter a color."}
                hint={
                  colorOk
                    ? `Contrast with white text: ${ratio.toFixed(1)}:1 (needs 4.5:1)`
                    : undefined
                }
              />
            </div>
          </div>
        </div>

        {/* Display text */}
        <Input
          label="Display text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={40}
          error={textError}
          hint="Used for the logo's alternative text and the letter badge."
        />

        <div className="flex justify-end">
          <Button
            loading={saving}
            disabled={!changed || !colorOk || !textOk}
            onClick={() => void save()}
          >
            Save changes
          </Button>
        </div>
      </div>

      {/* Preview: the brand color is applied only inside this box */}
      <div
        style={{ "--brand": preview.brandColor } as CSSProperties}
        className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Preview
        </p>
        <div className="h-20 w-full rounded-xl border border-slate-200 bg-white p-3">
          <BrandMark branding={preview} />
        </div>
        <div className="flex h-10 items-center gap-3 rounded-lg bg-brand px-3 text-sm font-medium text-onbrand shadow-sm">
          Active menu item
        </div>
        <span className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-onbrand shadow-sm">
          Primary button
        </span>
      </div>
    </div>
  );
}
