// The screen before login: sign in, sign up, or forgot password.
// Switching between them fades softly.
import { useState } from "react";
import { Headset } from "lucide-react";
import ThemeToggle from "../components/ui/ThemeToggle";
import LoginForm from "../components/auth/LoginForm";
import SignupForm from "../components/auth/SignupForm";
import ForgotForm from "../components/auth/ForgotForm";

type View = "login" | "signup" | "forgot";

export default function AuthPage() {
  const [view, setView] = useState<View>("login");
  // After a password reset we return to login with the email already filled in
  const [prefillEmail, setPrefillEmail] = useState("");

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-onbrand shadow-sm">
            <Headset className="h-6 w-6" aria-hidden />
          </div>
          <p className="text-sm font-medium text-slate-500">UOA Hospitality</p>
          <h1 className="text-xl font-semibold text-slate-900">
            Enterprise IT Helpdesk
          </h1>
        </div>

        {/* key={view}: a new view replays the fade-in */}
        <div
          key={view}
          className="animate-fade-in rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          {view === "login" && (
            <LoginForm
              initialEmail={prefillEmail}
              onSignup={() => setView("signup")}
              onForgot={() => setView("forgot")}
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
        </div>
      </div>
    </div>
  );
}
