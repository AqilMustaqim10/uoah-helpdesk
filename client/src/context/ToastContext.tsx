// Small, independently timed pop-up messages (bottom-right).
// Success/info vanish after 3 s, errors after 5 s.
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ToastItem, ToastKind } from "../types";
import ToastViewport from "../components/ui/ToastViewport";

export interface ToastApi {
  success: (message: string, action?: ToastItem["action"]) => void;
  error: (message: string, action?: ToastItem["action"]) => void;
  info: (message: string, action?: ToastItem["action"]) => void;
  dismiss: () => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, number>());
  const counter = useRef(0);

  const remove = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const dismiss = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.clear();
    setToasts([]);
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
    },
    [],
  );

  const show = useCallback(
    (kind: ToastKind, message: string, action?: ToastItem["action"]) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((current) => [...current, { id, kind, message, action }]);
      timers.current.set(
        id,
        window.setTimeout(
          () => remove(id),
          kind === "error" ? 5000 : 3000,
        ),
      );
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, action) => show("success", m, action),
      error: (m, action) => show("error", m, action),
      info: (m, action) => show("info", m, action),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onClose={remove} />
    </ToastContext.Provider>
  );
}
