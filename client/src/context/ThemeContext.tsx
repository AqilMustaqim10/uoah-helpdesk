// Light / dark mode. Saved in localStorage; follows the computer's setting until you choose.
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getStored, setStored } from "../lib/storage";

export interface ThemeValue {
  dark: boolean;
  toggle: () => void;
}

export const ThemeContext = createContext<ThemeValue | null>(null);

const KEY = "theme";
const query = () => window.matchMedia("(prefers-color-scheme: dark)");

function initialDark(): boolean {
  const saved = getStored(KEY);
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return query().matches; // no choice saved yet: follow the system
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(initialDark);

  // Put or remove the "dark" class on <html>. The CSS does the rest.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  // While the person has not chosen, follow changes of the system setting.
  useEffect(() => {
    const mq = query();
    const onChange = (e: MediaQueryListEvent) => {
      if (getStored(KEY) === null) setDark(e.matches);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    const root = document.documentElement;
    // Short-lived class that makes the color change fade smoothly
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 300);

    const next = !dark;
    setStored(KEY, next ? "dark" : "light");
    setDark(next);
  }, [dark]);

  const value = useMemo(() => ({ dark, toggle }), [dark, toggle]);
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
