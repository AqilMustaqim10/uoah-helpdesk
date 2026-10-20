// The "Security" window (shield icon in the top bar): shows how many recovery codes are left
// and creates a new set. The old codes stop working. Needs a CURRENT 6-digit code from the app.
import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { authApi } from "../../api/auth";
import { ApiError } from "../../api/client";
import Button from "../ui/Button";
import CodeInput from "../ui/CodeInput";
import FormError from "../ui/FormError";
import Modal from "../ui/Modal";
import Skeleton from "../ui/Skeleton";
import RecoveryCodes from "./RecoveryCodes";

export default function SecurityModal({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<{
    enabled: boolean;
    recoveryCodesLeft: number;
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    authApi
      .mfaStatus()
      .then((r) => !cancelled && setStatus(r))
      .catch(
        (err) =>
          !cancelled &&
          setLoadError(
            err instanceof ApiError
              ? err.message
              : "Could not load your security settings.",
          ),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  async function regenerate(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code))
      return setError("Enter the 6-digit code shown in your app.");

    setBusy(true);
    setError("");
    try {
      const r = await authApi.mfaRegenerate(code);
      setCodes(r.recoveryCodes);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label="Security" onClose={onClose} size="md">
      <div className="space-y-4 p-6">
        <div className="pr-10">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden />
            Security
          </h2>
          <p className="text-sm text-slate-500">
            Two-factor authentication is on for your account.
          </p>
        </div>

        {codes ? (
          <>
            <p className="text-sm font-medium text-slate-900">
              Your new recovery codes
            </p>
            <RecoveryCodes codes={codes} doneLabel="Done" onDone={onClose} />
          </>
        ) : loadError ? (
          <FormError message={loadError} />
        ) : !status ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Recovery codes left:{" "}
              <span className="font-semibold tabular-nums">
                {status.recoveryCodesLeft}
              </span>
              {status.recoveryCodesLeft <= 2 && (
                <span className="text-amber-700">
                  {" "}
                  Running low: create a new set below.
                </span>
              )}
            </p>

            <form onSubmit={regenerate} className="space-y-3" noValidate>
              <p className="text-sm text-slate-600">
                Creating a new set replaces all your old codes. Enter the
                current code from your app to confirm.
              </p>
              <FormError message={error} />
              <CodeInput value={code} onChange={setCode} />
              <Button type="submit" loading={busy} className="w-full">
                Create new recovery codes
              </Button>
            </form>
          </>
        )}
      </div>
    </Modal>
  );
}
