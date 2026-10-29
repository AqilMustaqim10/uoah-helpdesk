// Everything the PDF export needs to understand its filters: which business unit, which period, which time zone.
// Every value from the browser is validated here (400 on anything odd) before it gets near the database.
//
// A period becomes a half-open range of calendar days: from the first day (included) up to the day AFTER the
// last day (excluded). In SQL:   created_at >= start AND created_at < end   with both days read in the
// person's time zone. This is better than EXTRACT(MONTH FROM created_at) = x because it
//   - gives the right day for the person (a ticket made at 00:30 on 1 November in Malaysia is a November ticket)
//   - can use the index on created_at
//   - handles days, ISO weeks, months and years in exactly the same way
import { query } from "../db/pool";
import type { AuthUser } from "../middleware/auth";
import { HttpError } from "../lib/http";

export const PERIODS = ["all", "day", "week", "month", "year"] as const;
export type Period = (typeof PERIODS)[number];

const MONTHS = [
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
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

export interface PeriodRange {
  type: Period;
  /** First day (included) and the day AFTER the last day (excluded), as YYYY-MM-DD. null = all dates. */
  start: string | null;
  end: string | null;
  /** For the PDF header, e.g. "October 2026" or "Week 44, 26 Oct 2026 to 1 Nov 2026". */
  label: string;
  /** e.g. "1 Oct 2026 to 31 Oct 2026". Empty for all dates. */
  rangeText: string;
  /** For the file name, e.g. "2026-10" or "2026-W44". */
  slug: string;
}

/** A query-string value as clean text ('' when missing or not a string). */
const qstr = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const pad2 = (n: number) => String(n).padStart(2, "0");

// ---------- calendar maths (always in UTC, so no time zone or summer time can shift a date) ----------

/** "2026-10-29" -> a Date, or null when it is not a REAL date (30 February, 2026-13-01, text...). */
function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d
    ? date
    : null;
}

const ymd = (d: Date) =>
  `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const shortDate = (d: Date) =>
  `${d.getUTCDate()} ${SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** The ISO week of a MONDAY: weeks start on Monday, and week 1 is the week that holds the first Thursday of the year. */
function isoWeekOf(monday: Date): { week: number; year: number } {
  const thursday = addDays(monday, 3);
  const year = thursday.getUTCFullYear();
  const dayOfYear = (thursday.getTime() - Date.UTC(year, 0, 1)) / 86_400_000; // 0 for 1 January
  return { week: Math.floor(dayOfYear / 7) + 1, year };
}

function intParam(v: unknown, min: number, max: number, label: string): number {
  const s = qstr(v);
  if (!/^\d{1,4}$/.test(s))
    throw new HttpError(400, `Choose a valid ${label}.`);
  const n = Number(s);
  if (n < min || n > max)
    throw new HttpError(400, `The ${label} must be between ${min} and ${max}.`);
  return n;
}

// ---------- the period ----------

/** Reads and validates  period, date, month, year  from the query string. */
export function resolvePeriod(q: Record<string, unknown>): PeriodRange {
  if (q.period !== undefined && typeof q.period !== "string")
    throw new HttpError(400, "Invalid period.");
  const raw = qstr(q.period).toLowerCase();
  if (raw !== "" && !(PERIODS as readonly string[]).includes(raw)) {
    throw new HttpError(
      400,
      "Invalid period. Use all, day, week, month or year.",
    );
  }
  const type = (raw || "all") as Period;

  if (type === "all")
    return {
      type,
      start: null,
      end: null,
      label: "All dates",
      rangeText: "",
      slug: "all",
    };

  let first: Date;
  let after: Date; // the day AFTER the last day
  let label: string;
  let slug: string;

  if (type === "day" || type === "week") {
    const day = parseYmd(qstr(q.date));
    if (!day) throw new HttpError(400, "Choose a valid date.");

    if (type === "day") {
      first = day;
      after = addDays(day, 1);
      label = `${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]} ${day.getUTCFullYear()}`;
      slug = ymd(day);
    } else {
      // The week (Monday to Sunday) that holds the chosen day
      const monday = addDays(day, -((day.getUTCDay() + 6) % 7));
      first = monday;
      after = addDays(monday, 7);
      const iso = isoWeekOf(monday);
      label = `Week ${iso.week}, ${shortDate(first)} to ${shortDate(addDays(after, -1))}`;
      slug = `${iso.year}-W${pad2(iso.week)}`;
    }
  } else if (type === "month") {
    const year = intParam(q.year, MIN_YEAR, MAX_YEAR, "year");
    const month = intParam(q.month, 1, 12, "month");
    first = new Date(Date.UTC(year, month - 1, 1));
    after = new Date(Date.UTC(year, month, 1)); // month 12 rolls over to January of the next year by itself
    label = `${MONTHS[month - 1]} ${year}`;
    slug = `${year}-${pad2(month)}`;
  } else {
    const year = intParam(q.year, MIN_YEAR, MAX_YEAR, "year");
    first = new Date(Date.UTC(year, 0, 1));
    after = new Date(Date.UTC(year + 1, 0, 1));
    label = String(year);
    slug = String(year);
  }

  return {
    type,
    start: ymd(first),
    end: ymd(after),
    label,
    rangeText: `${shortDate(first)} to ${shortDate(addDays(after, -1))}`,
    slug,
  };
}

/**
 * The SQL condition for the period (null for "all dates"). nextParam = the number of the next free $ placeholder.
 * Only OUR code builds this text; the dates and the time zone travel as parameters.
 */
export function periodCondition(
  range: PeriodRange,
  timeZone: string,
  nextParam: number,
  alias = "t",
) {
  if (!range.start || !range.end) return null;
  const a = nextParam;
  return {
    sql:
      `${alias}.created_at >= (($${a}::date)::timestamp AT TIME ZONE $${a + 2}::text) AND ` +
      `${alias}.created_at < (($${a + 1}::date)::timestamp AT TIME ZONE $${a + 2}::text)`,
    params: [range.start, range.end, timeZone],
  };
}

// ---------- the time zone ----------

/** The browser's time zone, checked against PostgreSQL's own list. Anything unknown or odd becomes UTC. */
export async function dbTimeZone(v: unknown): Promise<string> {
  const tz = qstr(v);
  if (!tz || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return "UTC";
  const r = await query("SELECT 1 FROM pg_timezone_names WHERE name = $1", [
    tz,
  ]);
  return r.rows[0] ? tz : "UTC";
}

// ---------- the business unit ----------

export interface UnitChoice {
  id: number | null; // null = every unit
  code: string | null;
  label: string; // "Convention Centre & Events Corp (CCEC)" or "All business units"
}

/**
 * ADMIN: "all" or any existing unit.
 * IT: only their own unit. "all" means their own unit, and another unit is refused with 403.
 */
export async function resolveBusinessUnit(
  user: AuthUser,
  raw: unknown,
): Promise<UnitChoice> {
  if (raw !== undefined && typeof raw !== "string")
    throw new HttpError(400, "Invalid business unit.");
  const v = qstr(raw);
  const wantsAll = v === "" || v.toLowerCase() === "all";
  const wanted = /^\d{1,9}$/.test(v) ? Number(v) : NaN;

  if (user.role !== "ADMIN") {
    if (user.business_unit_id == null)
      throw new HttpError(403, "Your account has no business unit.");
    if (!wantsAll && wanted !== user.business_unit_id) {
      throw new HttpError(403, "You can only export your own business unit.");
    }
    const own = await query(
      "SELECT code, name FROM business_units WHERE id = $1",
      [user.business_unit_id],
    );
    if (!own.rows[0])
      throw new HttpError(403, "Your business unit was not found.");
    return {
      id: user.business_unit_id,
      code: own.rows[0].code,
      label: `${own.rows[0].name} (${own.rows[0].code})`,
    };
  }

  if (wantsAll) return { id: null, code: null, label: "All business units" };
  if (Number.isNaN(wanted)) throw new HttpError(400, "Invalid business unit.");

  const r = await query("SELECT code, name FROM business_units WHERE id = $1", [
    wanted,
  ]);
  if (!r.rows[0])
    throw new HttpError(400, "Please choose a valid business unit.");
  return {
    id: wanted,
    code: r.rows[0].code,
    label: `${r.rows[0].name} (${r.rows[0].code})`,
  };
}
