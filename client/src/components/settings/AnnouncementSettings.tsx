import { useEffect, useState } from "react";
import { announcementsApi } from "../../api/announcements";
import { ApiError } from "../../api/client";
import type { UnitAnnouncement, User } from "../../types";
import Button from "../ui/Button";
import FormError from "../ui/FormError";
import Skeleton from "../ui/Skeleton";
import { useToast } from "../../hooks/useToast";

export default function AnnouncementSettings({ user }: { user: User }) {
  const [units, setUnits] = useState<UnitAnnouncement[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    announcementsApi.list().then(({ units: loaded }) => {
      if (cancelled) return;
      setUnits(loaded);
      const selected = loaded.find((unit) => unit.id === user.business_unit_id) ?? loaded[0];
      setSelectedId(selected?.id ?? null);
      setText(selected?.announcement_text ?? "");
    }).catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Could not load announcements."));
    return () => { cancelled = true; };
  }, [user.business_unit_id]);

  const selected = units?.find((unit) => unit.id === selectedId) ?? null;
  function select(unit: UnitAnnouncement) {
    setSelectedId(unit.id);
    setText(unit.announcement_text ?? "");
    setError("");
  }
  async function save() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const result = await announcementsApi.save(selected.id, text.trim() || null);
      setUnits((current) => current?.map((unit) => unit.id === result.unit.id ? result.unit : unit) ?? current);
      setText(result.unit.announcement_text ?? "");
      toast.success(
        result.unit.announcement_text
          ? `Announcement published for ${result.unit.code}`
          : `Announcement removed for ${result.unit.code}`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the announcement.");
    } finally { setSaving(false); }
  }

  if (error && !units) return <FormError message={error} />;
  if (!units) return <div className="space-y-4" aria-busy="true"><Skeleton className="h-9 w-2/3" /><Skeleton className="h-52 w-full" /></div>;
  if (!selected) return <FormError message="Your account has no business unit, so there is no announcement to manage." />;

  return <div className="max-w-2xl space-y-4">
    <div><h2 className="text-base font-semibold text-slate-900">Dashboard announcements</h2><p className="text-sm text-slate-500">Publish one active notice for a business unit. Everyone in that unit sees it when they open their dashboard.</p></div>
    {user.role === "ADMIN" && <div className="flex flex-wrap gap-1.5" role="group" aria-label="Business unit">{units.map((unit) => <button key={unit.id} type="button" onClick={() => select(unit)} aria-pressed={unit.id === selected.id} className={`rounded-full px-3 py-1.5 text-sm font-medium ${unit.id === selected.id ? "bg-brand text-onbrand" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{unit.code}</button>)}</div>}
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <label className="block text-sm font-medium text-slate-800" htmlFor="announcement">Announcement for {selected.name}</label>
      <p className="mt-1 text-xs text-slate-500">Leave this blank and save to remove the current announcement.</p>
      <textarea id="announcement" value={text} onChange={(event) => setText(event.target.value.slice(0, 1000))} maxLength={1000} rows={6} placeholder="Example: Shared folder access is unavailable while we carry out maintenance." className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
      <div className="mt-1 text-right text-xs text-slate-400">{text.length}/1000</div>
      {error && <div className="mt-3"><FormError message={error} /></div>}
      <div className="mt-4 flex justify-end"><Button loading={saving} onClick={save}>{text.trim() ? "Publish announcement" : "Remove announcement"}</Button></div>
    </div>
  </div>;
}
