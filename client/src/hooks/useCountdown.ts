// A seconds countdown (used for the 60-second "resend code" wait).
// Returns [secondsLeft, start]. Call start(60) to begin.
import { useEffect, useState } from "react";

export function useCountdown(): [number, (seconds: number) => void] {
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (left <= 0) return;
    const t = window.setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left]);

  return [left, setLeft];
}
