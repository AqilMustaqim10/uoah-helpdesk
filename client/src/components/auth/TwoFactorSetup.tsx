// First-time setup (required for ADMIN and IT): scan the QR code, confirm one code, save the recovery codes.
// The server only signs the person in after the right code; this screen keeps the app on the sign-in page
// until the recovery codes have been saved.
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Copy, Smartphone } from "lucide-react";
import { authApi } from "../../api/auth";
import { ApiError } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import type { User } from "../../types";
import Button from "../ui/Button";
import CodeInput from "../ui/CodeInput";
import FormError from "../ui/FormError";
import Skeleton from "../ui/Skeleton";
import RecoveryCodes from "./RecoveryCodes";

export default function TwoFactorSetup({ onBack }: { onBack: () => void }) {
  const { setUser } = useAuth();
  const toast = useToast();

  const [info, setInfo] = useState<{
    secret: string;
    uri: string;
    qr: string;
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState<{
    user: User;
    codes: string[];
  } | null>(null);

  // Ask the server for the secret and the QR code (reloading the page shows the same secret again)
  useEffect(() => {
    let cancelled = false;
    authApi
      .mfaSetupStart()
      .then((r) => !cancelled && setInfo(r))
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          toast.info("Your sign-in expired. Please sign in again.");
          onBack();
        } else {
          setLoadError(
            err instanceof ApiError
              ? err.message
              : "Could not start the setup. Please try again.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function back() {
    try {
      await authApi.logout();
    } catch {
      /* nothing to cancel */
    }
    onBack();
  }

  async function copyKey() {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.secret);
      toast.success("Key copied");
    } catch {
      toast.error("Could not copy the key.");
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code))
      return setError("Enter the 6-digit code shown in your app.");

    setBusy(true);
    setError("");
    try {
      const r = await authApi.mfaSetupConfirm(code);
      setFinished({ user: r.user, codes: r.recoveryCodes }); // the person is signed in on the server, but not on screen yet
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
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

  // ---------- step 2: save the recovery codes ----------
  if (finished) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Two-factor authentication is on
          </h2>
          <p className="text-sm text-slate-500">
            One last thing: your recovery codes.
          </p>
        </div>
        <RecoveryCodes
          codes={finished.codes}
          doneLabel="Continue to the helpdesk"
          onDone={() => {
            toast.success(`Welcome, ${finished.user.name}!`);
            setUser(finished.user);
          }}
        />
      </div>
    );
  }

  // ---------- step 1: scan and confirm ----------
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Set up two-factor authentication
        </h2>
        <p className="text-sm text-slate-500">
          Your role needs an extra step when you sign in. It takes about a
          minute.
        </p>
      </div>

      <ol className="space-y-1 text-sm text-slate-600">
        <li>
          <span className="font-medium text-slate-900">1.</span> Install an
          authenticator app on your phone (Microsoft Authenticator, Google
          Authenticator, Authy or 1Password).
        </li>
        <li>
          <span className="font-medium text-slate-900">2.</span> In the app, add
          an account by scanning this code.
        </li>
        <li>
          <span className="font-medium text-slate-900">3.</span> Type the
          6-digit code the app shows.
        </li>
      </ol>

      <FormError message={loadError} />

      {!info && !loadError ? (
        <div
          className="flex justify-center"
          aria-busy="true"
          aria-label="Preparing"
        >
          <Skeleton className="h-56 w-56" />
        </div>
      ) : info ? (
        <>
          <div className="flex justify-center">
            {/* A fixed white background, so the code stays scannable in dark mode */}
            <img
              src={info.qr}
              alt="QR code for your authenticator app"
              width={224}
              height={224}
              className="rounded-lg border border-slate-200"
              style={{ background: "#ffffff" }}
            />
          </div>

          <div className="rounded-lg bg-slate-50 p-3 text-center">
            <p className="text-xs text-slate-500">
              Cannot scan? Enter this key by hand:
            </p>
            <p className="mt-1 break-all font-mono text-sm tracking-wider text-slate-900">
              {info.secret.replace(/(.{4})/g, "$1 ").trim()}
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => void copyKey()}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
              >
                <Copy className="h-3 w-3" aria-hidden /> Copy key
              </button>
              <a
                href={info.uri}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
              >
                <Smartphone className="h-3 w-3" aria-hidden /> On your phone?
                Open in the app
              </a>
            </div>
          </div>

          <form onSubmit={confirm} className="space-y-3" noValidate>
            <FormError message={error} />
            <CodeInput value={code} onChange={setCode} />
            <Button type="submit" loading={busy} className="w-full">
              Turn on two-factor authentication
            </Button>
          </form>
        </>
      ) : null}

      <button
        type="button"
        onClick={() => void back()}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> Cancel and sign out
      </button>
    </div>
  );
}
