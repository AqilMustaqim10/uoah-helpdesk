// The list of departments (from the server, so there is one list in one place).
// It is loaded once and remembered until the page is reloaded.
import { useEffect, useState } from "react";
import { authApi } from "../api/auth";

let cache: string[] | null = null;

export function useDepartments() {
  const [departments, setDepartments] = useState<string[]>(cache ?? []);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    authApi
      .departments()
      .then((r) => {
        cache = r.departments;
        if (!cancelled) {
          setDepartments(r.departments);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { departments, loading };
}
