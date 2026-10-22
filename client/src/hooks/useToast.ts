import { useContext } from "react";
import { ToastContext } from "../context/ToastContext";

/** Show pop-up messages:  const toast = useToast();  toast.success('Saved') */
export function useToast() {
  const v = useContext(ToastContext);
  if (!v) throw new Error("useToast must be used inside <ToastProvider>");
  return v;
}
