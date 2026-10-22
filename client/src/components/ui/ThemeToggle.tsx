// The sun/moon button that switches light and dark mode.
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import IconButton from "./IconButton";

export default function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <IconButton
      label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
    >
      {/* key makes the icon pop in each time it changes */}
      <span key={dark ? "sun" : "moon"} className="animate-scale-in">
        {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </span>
    </IconButton>
  );
}
