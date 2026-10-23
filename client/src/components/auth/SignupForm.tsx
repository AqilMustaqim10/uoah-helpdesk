// Sign up in two steps:
//  1) your details (including your department) -> we email a 6-digit code
//  2) enter the code -> account is created (always a normal USER) and you are signed in
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { authApi } from "../../api/auth";
import { ApiError } from "../../api/client";
import { emailProblem, passwordProblem } from "../../lib/validate";
import { useAuth } from "../../hooks/useAuth";
import { useCountdown } from "../../hooks/useCountdown";
import { useDepartments } from "../../hooks/useDepartments";
import { useToast } from "../../hooks/useToast";
import type { UnitOption } from "../../types";
import Button from "../ui/Button";
import CodeInput from "../ui/CodeInput";
import FormError from "../ui/FormError";
import Input from "../ui/Input";
import Select from "../ui/Select";

type FieldErrors = Partial<
  Record<
    "name" | "email" | "unit" | "department" | "password" | "confirm",
    string
  >
>;

export default function SignupForm({
  onBackToLogin,
}: {
  onBackToLogin: () => void;
}) {
  const { setUser } = useAuth();
  const toast = useToast();
  const { departments, loading: departmentsLoading } = useDepartments();

  const [step, setStep] = useState<"details" | "code">("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [unitId, setUnitId] = useState("");
  const [department, setDepartment] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");

  const [units, setUnits] = useState<UnitOption[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useCountdown();

  // Load the business units for the dropdown
  useEffect(() => {
    let cancelled = false;
    authApi
      .units()
      .then((r) => !cancelled && setUnits(r.units))
      .catch(
        () =>
          !cancelled &&
          setFormError(
            "Could not load the business units. Please refresh the page.",
          ),
      )
      .finally(() => !cancelled && setUnitsLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  /** Asks the server to email a code. Returns true if it worked. */
  async function requestCode(): Promise<boolean> {
    setBusy(true);
    setFormError("");
    try {
      await authApi.signupRequest({
        email: email.trim(),
        name: name.trim(),
        department,
        password,
        business_unit_id: Number(unitId),
      });
      setCooldown(60); // the server allows a new code once every 60 seconds
      return true;
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.";
      // "Please wait 42 seconds..." -> start the countdown from that number
      const wait = /wait (\d+)/.exec(message);
      if (wait) setCooldown(Number(wait[1]));
      setFormError(message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitDetails(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    const errs: FieldErrors = {};
    if (!name.trim()) errs.name = "Name is required.";
    const ep = emailProblem(email);
    if (ep) errs.email = ep;
    if (!unitId) errs.unit = "Choose your business unit.";
    if (!department) errs.department = "Choose your department.";
    const pp = passwordProblem(password);
    if (pp) errs.password = pp;
    if (confirm !== password) errs.confirm = "Passwords do not match.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    if (await requestCode()) {
      setCode("");
      setStep("code");
    }
  }

  async function resend() {
    if (busy || cooldown > 0) return;
    if (await requestCode()) toast.success("A new code has been sent.");
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code))
      return setFormError("Enter the 6-digit code from your email.");

    setBusy(true);
    setFormError("");
    try {
      const r = await authApi.signupVerify(email.trim(), code);
      toast.success(`Welcome, ${r.user.name}!`);
      setUser(r.user); // signs the new person in; this form disappears
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setBusy(false);
    }
  }

  // ---------- Step 2: enter the code ----------
  if (step === "code") {
    return (
      <form onSubmit={submitCode} className="space-y-4" noValidate>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            Check your email
          </h2>
          <p className="text-sm text-slate-500">
            We sent a 6-digit code to{" "}
            <span className="font-medium text-slate-700">{email.trim()}</span>.
            It expires in 10 minutes.
          </p>
        </div>

        <FormError message={formError} />
        <CodeInput value={code} onChange={setCode} />

        <Button type="submit" loading={busy} className="w-full">
          Verify and create account
        </Button>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setStep("details");
              setFormError("");
            }}
            className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" /> Change details
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

  // ---------- Step 1: your details ----------
  return (
    <form onSubmit={submitDetails} className="space-y-3" noValidate>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">
          Create your account
        </h2>
        <p className="text-sm text-slate-500">
          Use your company email address.
        </p>
      </div>

      <FormError message={formError} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Full name"
          labelClassName="font-semibold"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          maxLength={100}
        />
        <Input
          label="Company email"
          labelClassName="font-semibold"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          placeholder="you@company.com"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Business unit"
          labelClassName="font-semibold"
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          error={errors.unit}
          disabled={unitsLoading}
        >
          <option value="">
            {unitsLoading ? "Loading…" : "Choose your unit"}
          </option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.code})
            </option>
          ))}
        </Select>
        <Select
          label="Department"
          labelClassName="font-semibold"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          error={errors.department}
          disabled={departmentsLoading}
        >
          <option value="">
            {departmentsLoading ? "Loading…" : "Choose your department"}
          </option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Password"
          labelClassName="font-semibold"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint="At least 10 characters, with a letter and a number."
        />
        <Input
          label="Confirm password"
          labelClassName="font-semibold"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
      </div>

      <Button type="submit" loading={busy} className="w-full">
        Send me a code
      </Button>

      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <button
          type="button"
          onClick={onBackToLogin}
          className="font-medium text-indigo-600 hover:underline"
        >
          Sign in
        </button>
      </p>
    </form>
  );
}
