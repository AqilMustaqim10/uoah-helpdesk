// Sign-in form. For USER accounts a correct password signs in at once (the app then switches to the main screen).
// ADMIN and IT accounts get a second step: onMfa() tells the page to show the code (or setup) screen.
import { useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import { emailProblem } from "../../lib/validate";
import { useAuth } from "../../hooks/useAuth";
import Button from "../ui/Button";
import FormError from "../ui/FormError";
import Input from "../ui/Input";

interface Props {
  initialEmail: string;
  onSignup: () => void;
  onForgot: () => void;
  onMfa: (phase: "verify" | "setup") => void;
}

export default function LoginForm({
  initialEmail,
  onSignup,
  onForgot,
  onMfa,
}: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    const problem = emailProblem(email);
    if (problem) return setError(problem);
    if (!password) return setError("Password is required.");

    setBusy(true);
    setError("");
    try {
      const outcome = await login(email.trim(), password);
      if (outcome !== "ok") {
        setBusy(false);
        onMfa(outcome); // the password was right; now the code (or the first-time setup)
      }
      // outcome 'ok': this form disappears because the app now has a user
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">
          Welcome back
        </h2>
        <p className="text-sm text-slate-500">Sign in to your account.</p>
      </div>

      <FormError message={error} />

      <Input
        label="Email"
        labelClassName="font-semibold"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
      />
      <Input
        label="Password"
        labelClassName="font-semibold"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onForgot}
          className="text-sm font-medium text-indigo-600 hover:underline"
        >
          Forgot password?
        </button>
      </div>

      <Button type="submit" loading={busy} className="w-full">
        Sign in
      </Button>

      <p className="text-center text-sm text-slate-500">
        New here?{" "}
        <button
          type="button"
          onClick={onSignup}
          className="font-medium text-indigo-600 hover:underline"
        >
          Create an account
        </button>
      </p>
    </form>
  );
}
