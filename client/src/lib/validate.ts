// Quick checks for form fields, only for friendly feedback.
// The SERVER repeats every check, so these can never be the only protection.

export function emailProblem(v: string): string | null {
  const e = v.trim();
  if (!e) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    return "Enter a valid email address.";
  return null;
}

export function passwordProblem(v: string): string | null {
  if (v.length < 10) return "Use at least 10 characters.";
  if (new TextEncoder().encode(v).length > 72) return "Password is too long.";
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v))
    return "Include at least one letter and one number.";
  return null;
}
