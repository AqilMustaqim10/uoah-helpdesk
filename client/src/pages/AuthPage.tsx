// The screen before login: sign in, sign up, forgot password, or (after a correct password
// for ADMIN / IT) the two-factor step. Switching between them fades softly.
import { useState } from "react";
import ThemeToggle from "../components/ui/ThemeToggle";
import LoginForm from "../components/auth/LoginForm";
import SignupForm from "../components/auth/SignupForm";
import ForgotForm from "../components/auth/ForgotForm";
import TwoFactorForm from "../components/auth/TwoFactorForm";
import TwoFactorSetup from "../components/auth/TwoFactorSetup";

type View = "login" | "signup" | "forgot" | "mfa";

const AUTH_BACKGROUND_IMAGES = [
  "/bg-img/VE.JPG",
  "/bg-img/UOA.jpg",
  "/bg-img/Potager.jpg",
  "/bg-img/KLW.jpg",
  "/bg-img/KLBS.jpg",
  "/bg-img/Entier.jpg",
  "/bg-img/CCEC.jpg",
  "/bg-img/Botanica.jpg",
  "/bg-img/Astana.png",
] as const;

export default function AuthPage() {
  const [view, setView] = useState<View>("login");
  // 'verify' = enter a code; 'setup' = first-time setup of the authenticator app
  const [mfaPhase, setMfaPhase] = useState<"verify" | "setup">("verify");
  // After a password reset we return to login with the email already filled in
  const [prefillEmail, setPrefillEmail] = useState("");
  const backgroundImageInterval = 8;
  const backgroundCycleDuration =
    AUTH_BACKGROUND_IMAGES.length * backgroundImageInterval;

  return (
    <div
      className={`relative isolate flex min-h-dvh items-center justify-center bg-slate-50 px-4 ${
        view === "signup" ? "py-3 sm:py-5" : "py-10"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        {AUTH_BACKGROUND_IMAGES.map((image, index) => (
          <img
            key={image}
            src={image}
            alt=""
            className="auth-background-image absolute inset-0 h-full w-full object-cover"
            style={{
              animationDelay: `${index * backgroundImageInterval}s`,
              animationDuration: `${backgroundCycleDuration}s`,
            }}
          />
        ))}
      </div>

      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div
        className={`relative z-10 w-full ${
          view === "signup" ? "max-w-lg" : "max-w-md"
        }`}
      >
        {/* key={view}: a new view replays the fade-in */}
        <div
          key={view}
          className="auth-form-transition overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex flex-col items-center border-b border-slate-200 bg-white px-4 py-3 text-center">
            <img
              src="/uoah-logo.png"
              alt="UOA Hospitality logo"
              className="mb-2 h-9 w-auto max-w-36 object-contain dark:brightness-0 dark:invert"
            />
            <h1 className="text-base font-bold leading-tight tracking-tight text-slate-900">
              Enterprise IT Helpdesk
            </h1>
          </div>

          <div
            className={`${
              view === "signup" ? "p-4 sm:p-5" : "p-6 sm:p-8"
            }`}
          >
            {view === "login" && (
              <LoginForm
                initialEmail={prefillEmail}
                onSignup={() => setView("signup")}
                onForgot={() => setView("forgot")}
                onMfa={(phase) => {
                  setMfaPhase(phase);
                  setView("mfa");
                }}
              />
            )}
            {view === "signup" && (
              <SignupForm onBackToLogin={() => setView("login")} />
            )}
            {view === "forgot" && (
              <ForgotForm
                onBackToLogin={() => setView("login")}
                onDone={(email) => {
                  setPrefillEmail(email);
                  setView("login");
                }}
              />
            )}
            {view === "mfa" &&
              (mfaPhase === "verify" ? (
                <TwoFactorForm onBack={() => setView("login")} />
              ) : (
                <TwoFactorSetup onBack={() => setView("login")} />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
