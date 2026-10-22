// The departments a person can choose at sign-up, and that an administrator or IT can pick when creating an account.
// TO CHANGE THE LIST: edit the names below, save, and restart the API. The web pages read the list from the server.
// People who already have a department keep it, even if you later remove it from this list.
import { HttpError } from "../lib/http";

// Each name must be 2 to 60 characters. This is a STARTER list: replace it with your real departments.
export const DEPARTMENTS: readonly string[] = [
  "Front Office",
  "Housekeeping",
  "Food & Beverage",
  "Kitchen",
  "Banquet & Events",
  "Sales & Marketing",
  "Finance & Accounts",
  "Human Resources",
  "Information Technology",
  "Engineering & Maintenance",
  "Security",
  "Purchasing",
  "Management & Administration",
  "Other",
];

/** A department from a request. It must be exactly one of the names above (the list is the whitelist). */
export function parseDepartment(v: unknown): string {
  if (typeof v !== "string" || !DEPARTMENTS.includes(v)) {
    throw new HttpError(400, "Please choose your department.");
  }
  return v;
}
