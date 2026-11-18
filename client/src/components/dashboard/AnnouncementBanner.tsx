import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { m, useReducedMotion } from "framer-motion";
import { announcementsApi, type CurrentAnnouncement } from "../../api/announcements";

export default function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<CurrentAnnouncement | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    announcementsApi.current().then((result) => {
      if (!cancelled) {
        setAnnouncement(result.announcement);
      }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  if (!announcement) return null;
  const updated = new Date(announcement.updated_at);
  const timestamp = Number.isNaN(updated.getTime())
    ? ""
    : `Updated ${updated.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  return <m.section
    initial={reduceMotion ? false : { opacity: 0, y: -8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: reduceMotion ? 0 : 0.24, ease: "easeOut" }}
    className="overflow-hidden rounded-2xl border border-amber-200 bg-[linear-gradient(110deg,#fffbeb_0%,#fff7d6_100%)] text-amber-950 shadow-sm dark:bg-[linear-gradient(110deg,#2b1605_0%,#3d2308_100%)]"
    role="status"
    aria-label="Business unit announcement"
  >
    <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-200/70 text-amber-800"><Megaphone className="h-4.5 w-4.5" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <h2 className="text-sm font-semibold">Service announcement</h2>
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">Active</span>
        </div>
        <p className="text-xs text-amber-800">{timestamp || "Important update from your IT team"}</p>
      </div>
    </div>
    <div className="border-t border-amber-200/80 px-4 pb-4 pt-3 sm:px-5">
      <p className="whitespace-pre-wrap text-sm leading-6 text-amber-950">{announcement.text}</p>
    </div>
  </m.section>;
}
