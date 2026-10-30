// Finds the logo a PDF report should show, for one business unit or for "all business units".
// The logos are the ones an administrator uploads in Settings, Branding (business_units.logo_file in the database,
// the file itself in server/uploads). PDFs can only use PNG and JPG pictures; anything else gives a colored badge.
import fs from "node:fs/promises";
import { query } from "../db/pool";
import { detectFileType } from "../lib/fileType";
import { jpegLooksSane, pngIsSafe } from "../lib/logoCheck";
import { storedPath } from "./upload";

/** A report for ALL business units shows the logo of this unit (the group head office). Change the code to use another. */
export const GROUP_UNIT_CODE = "HQ";
const GROUP_BADGE_TEXT = "UOA";
const NEUTRAL_BADGE_COLOR = "#334155";
const MAX_LOGO_FILE_BYTES = 2 * 1024 * 1024; // uploads are limited to 1 MB; this is just a second safety limit

export type LogoProblem = "NO_LOGO" | "UNSUPPORTED_TYPE" | "UNREADABLE";

export interface ReportLogo {
  /** The vetted PNG or JPEG bytes, or null when the report must show the badge instead. */
  image: Buffer | null;
  mime: "image/png" | "image/jpeg" | null;
  /** The badge used when there is no image: the unit code in the unit's brand color. */
  badgeText: string;
  badgeColor: string;
  /** Why there is no image (null when there is one). */
  problem: LogoProblem | null;
}

/** unitId = null means "all business units". Never throws because of a bad logo. */
export async function reportLogoFor(
  unitId: number | null,
): Promise<ReportLogo> {
  const all = unitId === null;
  const r = all
    ? await query(
        "SELECT code, brand_color, logo_file, logo_mime FROM business_units WHERE code = $1",
        [GROUP_UNIT_CODE],
      )
    : await query(
        "SELECT code, brand_color, logo_file, logo_mime FROM business_units WHERE id = $1",
        [unitId],
      );
  const row = r.rows[0];

  const badge = {
    badgeText: all ? GROUP_BADGE_TEXT : (row?.code ?? GROUP_BADGE_TEXT),
    badgeColor: row?.brand_color ?? NEUTRAL_BADGE_COLOR,
  };
  const without = (problem: LogoProblem): ReportLogo => ({
    image: null,
    mime: null,
    ...badge,
    problem,
  });

  if (!row || !row.logo_file) return without("NO_LOGO");
  if (row.logo_mime === "image/webp") return without("UNSUPPORTED_TYPE");

  let buf: Buffer;
  try {
    buf = await fs.readFile(storedPath(row.logo_file)); // storedPath refuses any name we did not generate
  } catch {
    return without("UNREADABLE"); // the file is missing from the uploads folder
  }
  if (buf.length === 0 || buf.length > MAX_LOGO_FILE_BYTES)
    return without("UNREADABLE");

  // The REAL type comes from the file's own bytes, not from the database or the name
  const kind = detectFileType(buf);
  if (kind?.mime === "image/webp") return without("UNSUPPORTED_TYPE");
  if (kind?.mime === "image/png" && pngIsSafe(buf))
    return { image: buf, mime: "image/png", ...badge, problem: null };
  if (kind?.mime === "image/jpeg" && jpegLooksSane(buf))
    return { image: buf, mime: "image/jpeg", ...badge, problem: null };
  return without("UNREADABLE");
}
