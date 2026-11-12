// A shimmering placeholder block shown while data is loading.
// The sweep colors come from index.css (.skeleton), so it looks right in light and dark mode.
import { cn } from "../../lib/cn";

export default function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("skeleton animate-shimmer rounded-lg", className)}
    />
  );
}
