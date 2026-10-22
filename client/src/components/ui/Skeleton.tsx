// A softly pulsing grey block shown while data is loading.
import { cn } from "../../lib/cn";

export default function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-shimmer rounded-lg bg-slate-100", className)}
    />
  );
}
