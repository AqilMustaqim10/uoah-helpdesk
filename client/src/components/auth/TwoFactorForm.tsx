// The second step of sign-in: the 6-digit code from the authenticator app (or a recovery code).
import { useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { authApi } from "../../api/auth";
import { ApiError } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import Button from "../ui/Button";
import FormError from "../ui/FormError";
import Input from "../ui/Input";

export default function TwoFactorForm({ onBack }: { onBack: () => void }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  /** Back to the password screen. This also cancels the half-finished sign-in on the server. */
  async function back() {
    try {
      await authApi.logout();
    } catch {
      /* nothing to cancel if the server cannot be reached */
    }
    onBack();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const value = code.trim();
    if (!value) return setError("Enter the code from your authenticator app.");

    setBusy(true);
    setError("");
    try {
      const r = await authApi.mfaVerify(value);
      if (r.recoveryLeft !== null) {
        toast.info(
          `You used a recovery code. ${r.recoveryLeft} left. You can create new ones with the shield icon.`,
        );
      }
      setUser(r.user); // signed in: this form disappears
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // The five minutes ran out (or the account changed): start again
        toast.info("Your sign-in expired. Please sign in again.");
        onBack();
        return;
      }
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setCode("");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Two-factor authentication
        </h2>
        <p className="text-sm text-slate-500">
          Open your authenticator app and enter the 6-digit code for UOA IT
          Helpdesk.
        </p>
      </div>

      <FormError message={error} />

      <Input
        label="Authentication code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoComplete="one-time-code"
        autoFocus
        maxLength={20}
        placeholder="123456"
        hint="Lost your phone? Enter one of your recovery codes instead."
        inputClassName="text-center font-mono text-lg tracking-widest"
      />

      <Button type="submit" loading={busy} className="w-full">
        Verify and sign in
      </Button>

      <button
        type="button"
        onClick={() => void back()}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> Use a different account
      </button>
    </form>
  );
}
