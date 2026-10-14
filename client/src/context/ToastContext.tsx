// Small pop-up messages (bottom-right). Only ONE at a time: a new one replaces the old one.
// Success/info vanish after 3 s, errors after 5 s.
import {
  createContext,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ToastItem, ToastKind } from "../types";
import ToastViewport from "../components/ui/ToastViewport";

export interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  dismiss: () => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const counter = useRef(0);

  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback((kind: ToastKind, message: string) => {
    window.clearTimeout(timer.current);
    counter.current += 1;
    setToast({ id: counter.current, kind, message });
    timer.current = window.setTimeout(
      () => setToast(null),
      kind === "error" ? 5000 : 3000,
    );
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => show("success", m),
      error: (m) => show("error", m),
      info: (m) => show("info", m),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toast={toast} onClose={dismiss} />
    </ToastContext.Provider>
  );
}
