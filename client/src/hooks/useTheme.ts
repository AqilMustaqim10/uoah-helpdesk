import { useContext } from "react";
import { ThemeContext } from "../context/ThemeContext";

/** Access light/dark mode: { dark, toggle }. */
export function useTheme() {
  const v = useContext(ThemeContext);
  if (!v) throw new Error("useTheme must be used inside <ThemeProvider>");
  return v;
}
