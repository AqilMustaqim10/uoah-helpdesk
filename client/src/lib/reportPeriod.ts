// Small date helpers for the export window. They only give instant feedback ("Week 44: Mon 26 Oct to Sun 1 Nov");
// the SERVER validates every value again and has the final say.

export type ExportPeriod = "all" | "day" | "week" | "month" | "year";

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Today as YYYY-MM-DD in the person's OWN time zone (toISOString would give the UTC day). */
export function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "2026-10-29" -> a Date (calendar maths in UTC), or null when it is not a real date. */
function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 2000 || y > 2100) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d
    ? date
    : null;
}

export const isValidYmd = (s: string): boolean => parseYmd(s) !== null;

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const short = (d: Date) =>
  `${d.getUTCDate()} ${SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

export interface WeekInfo {
  week: number;
  first: Date; // Monday
  last: Date; // Sunday
  text: string;
}

/** The ISO week (Monday to Sunday) that holds the given day. */
export function weekInfo(ymd: string): WeekInfo | null {
  const day = parseYmd(ymd);
  if (!day) return null;
  const monday = addDays(day, -((day.getUTCDay() + 6) % 7));
  const sunday = addDays(monday, 6);
  const thursday = addDays(monday, 3);
  const dayOfYear =
    (thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1)) /
    86_400_000;
  const week = Math.floor(dayOfYear / 7) + 1;
  return {
    week,
    first: monday,
    last: sunday,
    text: `Week ${week}: Mon ${short(monday)} to Sun ${short(sunday)}`,
  };
}

/** The same wording the PDF header uses: "October 2026", "Week 44, 26 Oct 2026 to 1 Nov 2026", ... */
export function periodSummary(
  period: ExportPeriod,
  date: string,
  month: number,
  year: number,
): string {
  switch (period) {
    case "day": {
      const d = parseYmd(date);
      return d
        ? `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
        : "Choose a day";
    }
    case "week": {
      const w = weekInfo(date);
      return w
        ? `Week ${w.week}, ${short(w.first)} to ${short(w.last)}`
        : "Choose a day in the week";
    }
    case "month":
      return `${MONTH_NAMES[month - 1]} ${year}`;
    case "year":
      return String(year);
    default:
      return "All dates";
  }
}
