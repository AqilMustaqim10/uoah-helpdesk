// Forgot password in two steps:
//  1) enter your email -> a code is emailed (the page says the same thing whether or not the email exists)
//  2) enter the code + a new password -> all old sessions are signed out
import { useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { authApi } from "../../api/auth";
import { ApiError } from "../../api/client";
import { emailProblem, passwordProblem } from "../../lib/validate";
import { useCountdown } from "../../hooks/useCountdown";
import { useToast } from "../../hooks/useToast";
import Button from "../ui/Button";
import CodeInput from "../ui/CodeInput";
import FormError from "../ui/FormError";
import Input from "../ui/Input";

interface Props {
  onBackToLogin: () => void;
  /** Called after a successful reset, with the email so login can be pre-filled. */
  onDone: (email: string) => void;
}

export default function ForgotForm({ onBackToLogin, onDone }: Props) {
  const toast = useToast();

  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [errors, setErrors] = useState<
    Partial<Record<"email" | "password" | "confirm", string>>
  >({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useCountdown();

  /** Asks for a code. Returns true if the request was accepted. */
  async function requestCode(): Promise<boolean> {
    setBusy(true);
    setFormError("");
    try {
      await authApi.forgotRequest(email.trim());
      setCooldown(60);
      return true;
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.";
      const wait = /wait (\d+)/.exec(message);
      if (wait) setCooldown(Number(wait[1]));
      setFormError(message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const ep = emailProblem(email);
    setErrors({ email: ep ?? undefined });
    if (ep) return;
    if (await requestCode()) {
      setCode("");
      setStep("reset");
    }
  }

  async function resend() {
    if (busy || cooldown > 0) return;
    if (await requestCode())
      toast.success("If the email is registered, a new code has been sent.");
  }

  async function submitReset(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    if (!/^\d{6}$/.test(code))
      return setFormError("Enter the 6-digit code from your email.");
    const errs: typeof errors = {};
    const pp = passwordProblem(password);
    if (pp) errs.password = pp;
    if (confirm !== password) errs.confirm = "Passwords do not match.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setBusy(true);
    setFormError("");
    try {
      await authApi.forgotReset(email.trim(), code, password);
      toast.success("Password updated. Please sign in.");
      onDone(email.trim());
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setBusy(false);
    }
  }

  // ---------- Step 2: code + new password ----------
  if (step === "reset") {
    return (
      <form onSubmit={submitReset} className="space-y-4" noValidate>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Set a new password
          </h2>
          <p className="text-sm text-slate-500">
            If{" "}
            <span className="font-medium text-slate-700">{email.trim()}</span>{" "}
            has an account, we sent it a 6-digit code. It expires in 10 minutes.
          </p>
        </div>

        <FormError message={formError} />
        <CodeInput value={code} onChange={setCode} />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint="At least 10 characters, with a letter and a number."
        />
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />

        <Button type="submit" loading={busy} className="w-full">
          Update password
        </Button>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setFormError("");
            }}
            className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" /> Change email
          </button>
          <button
            type="button"
            onClick={resend}
            disabled={cooldown > 0 || busy}
            className="font-medium text-indigo-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
        </div>
      </form>
    );
  }

  // ---------- Step 1: email ----------
  return (
    <form onSubmit={submitEmail} className="space-y-4" noValidate>
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Forgot your password?
        </h2>
        <p className="text-sm text-slate-500">
          Enter your email and we will send you a 6-digit code.
        </p>
      </div>

      <FormError message={formError} />

      <Input
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        placeholder="you@company.com"
      />

      <Button type="submit" loading={busy} className="w-full">
        Send code
      </Button>

      <p className="text-center text-sm text-slate-500">
        <button
          type="button"
          onClick={onBackToLogin}
          className="font-medium text-indigo-600 hover:underline"
        >
          Back to sign in
        </button>
      </p>
    </form>
  );
}
