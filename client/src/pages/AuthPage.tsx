import { useEffect, useRef, useState } from "react";
import { ArrowDownRight, Building2 } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { ApiError } from "../api/client";
import { authApi } from "../api/auth";
import type { UnitOption } from "../types";
import ThemeToggle from "../components/ui/ThemeToggle";
import LoginForm from "../components/auth/LoginForm";
import SignupForm from "../components/auth/SignupForm";
import ForgotForm from "../components/auth/ForgotForm";
import TwoFactorForm from "../components/auth/TwoFactorForm";
import TwoFactorSetup from "../components/auth/TwoFactorSetup";
import { loadGsap } from "../lib/gsapRuntime";

type View = "login" | "signup" | "forgot" | "mfa";

const WORDMARK_STYLES = [
  "font-serif tracking-[0.16em]",
  "font-semibold tracking-[0.2em]",
  "font-serif italic tracking-wide",
  "font-bold tracking-tight",
  "font-medium tracking-[0.12em]",
  "font-serif font-semibold tracking-wide",
  "font-bold tracking-[0.16em]",
  "font-medium italic tracking-tight",
  "font-semibold tracking-[0.1em]",
];

export default function AuthPage() {
  const pageRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const [view, setView] = useState<View>("login");
  const [mfaPhase, setMfaPhase] = useState<"verify" | "setup">("verify");
  const [prefillEmail, setPrefillEmail] = useState("");
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [unitsError, setUnitsError] = useState("");

  useEffect(() => {
    const root = pageRef.current;
    if (!root || reduceMotion !== false) return;

    let cancelled = false;
    let revert: (() => void) | undefined;
    void loadGsap().then(({ gsap }) => {
      if (cancelled) return;
      const context = gsap.context(() => {
        gsap
          .timeline({ defaults: { ease: "power3.out" } })
          .fromTo(
            ".auth-brand-header",
            { autoAlpha: 0, y: -12 },
            { autoAlpha: 1, y: 0, duration: 0.6 },
          )
          .fromTo(
            ".auth-brand-kicker",
            { autoAlpha: 0, y: 12 },
            { autoAlpha: 1, y: 0, duration: 0.48 },
            "-=0.25",
          )
          .fromTo(
            ".auth-brand-title",
            { autoAlpha: 0, y: 18 },
            { autoAlpha: 1, y: 0, duration: 0.72 },
            "-=0.2",
          )
          .fromTo(
            ".auth-brand-description",
            { autoAlpha: 0, y: 12 },
            { autoAlpha: 1, y: 0, duration: 0.55 },
            "-=0.32",
          )
          .fromTo(
            ".auth-brand-footer",
            { autoAlpha: 0, y: 10 },
            { autoAlpha: 1, y: 0, duration: 0.5 },
            "-=0.35",
          );
      }, root);
      revert = () => context.revert();
    });

    return () => {
      cancelled = true;
      revert?.();
    };
  }, [reduceMotion]);

  useEffect(() => {
    const root = pageRef.current;
    if (!root || !units.length || reduceMotion !== false) return;

    let cancelled = false;
    let revert: (() => void) | undefined;
    void loadGsap().then(({ gsap }) => {
      if (cancelled) return;
      const context = gsap.context(() => {
        gsap.fromTo(
          ".auth-unit-card",
          { autoAlpha: 0, y: 14 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.55,
            stagger: 0.065,
            ease: "power3.out",
            scrollTrigger: {
              trigger: ".auth-unit-grid",
              start: "top 92%",
              once: true,
            },
          },
        );
      }, root);
      revert = () => context.revert();
    });

    return () => {
      cancelled = true;
      revert?.();
    };
  }, [reduceMotion, units.length]);

  useEffect(() => {
    let cancelled = false;
    authApi
      .units()
      .then(({ units: availableUnits }) => {
        if (!cancelled) setUnits(availableUnits);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setUnitsError(
          error instanceof ApiError
            ? error.message
            : "Business units could not be loaded.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main ref={pageRef} className="min-h-dvh bg-slate-50 lg:grid lg:grid-cols-2">
      <section
        aria-label="UDESK business units"
        className="auth-brand-panel relative hidden min-h-dvh overflow-hidden bg-[#080b14] text-[#f8fafc] lg:flex lg:flex-col lg:justify-between lg:px-10 lg:py-9 xl:px-16 xl:py-12"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-36 -top-40 h-[32rem] w-[32rem] rounded-full bg-indigo-600/20 blur-[120px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]"
        />

        <header className="auth-brand-header relative z-10 flex items-center gap-4">
          <img
            src="/uoah-logo.png"
            alt="UOA Hospitality"
            className="h-11 w-auto max-w-36 object-contain brightness-0 invert"
          />
          <span aria-hidden="true" className="h-8 w-px bg-white/20" />
          <div>
            <p className="text-sm font-bold tracking-[0.24em]">UDESK</p>
            <p className="mt-1 text-xs text-[#94a3b8]">Digital Support &amp; Knowledge</p>
          </div>
        </header>

        <div className="auth-brand-content auth-brand-copy relative z-10 mx-auto w-full max-w-2xl py-10">
          <div className="mb-8 max-w-lg">
            <p className="auth-brand-kicker mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-indigo-300">
              One desk. Every team.
            </p>
            <h1 className="auth-brand-title text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
              Unified IT Service Desk across all Business Units
            </h1>
            <p className="auth-brand-description mt-3 text-sm leading-6 text-[#cbd5e1]">
              Connected support and knowledge, built around the teams that
              power UOA Hospitality.
            </p>
          </div>

          <div
            aria-label="Business unit wordmarks"
            className="auth-unit-grid grid grid-cols-3 gap-3 xl:gap-4"
          >
            {units.map((unit, index) => (
              <div
                key={unit.id}
                className="auth-unit-card group flex min-h-24 flex-col justify-between rounded-xl border border-white/[0.09] bg-white/[0.035] p-4 transition duration-300 hover:scale-[1.03] hover:border-indigo-300/30 hover:bg-white/[0.07] hover:shadow-[0_0_28px_rgba(99,102,241,0.12)] xl:min-h-28"
                title={`${unit.name} (${unit.code})`}
              >
                <Building2
                  aria-hidden="true"
                  className="h-4 w-4 text-[#94a3b8] opacity-70 transition duration-300 group-hover:scale-110 group-hover:text-indigo-300 group-hover:opacity-100"
                  strokeWidth={1.5}
                />
                <div className="mt-3 min-w-0">
                  <p
                    className={`truncate text-[11px] text-[#f8fafc]/60 opacity-70 grayscale transition duration-300 group-hover:text-indigo-100 group-hover:opacity-100 group-hover:grayscale-0 xl:text-xs ${WORDMARK_STYLES[index % WORDMARK_STYLES.length]}`}
                  >
                    {unit.code}
                  </p>
                  <p className="mt-1 truncate text-[10px] leading-tight text-[#94a3b8] transition-colors group-hover:text-[#e2e8f0] xl:text-[11px]">
                    {unit.name}
                  </p>
                </div>
              </div>
            ))}

            {units.length === 0 && !unitsError && (
              <p className="col-span-3 rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 py-6 text-sm text-[#cbd5e1]">
                Loading business units…
              </p>
            )}
            {unitsError && (
              <p role="status" className="col-span-3 text-xs text-[#cbd5e1]">
                {unitsError}
              </p>
            )}
          </div>
          <div className="mt-5 flex items-center gap-2 text-xs text-[#94a3b8]">
            <ArrowDownRight aria-hidden="true" className="h-4 w-4 text-indigo-300/70" />
            <span>Support that brings every business unit together</span>
          </div>
        </div>

        <footer className="auth-brand-footer relative z-10 flex items-center justify-between gap-4 border-t border-white/10 pt-5 text-xs text-[#94a3b8]">
          <span>Powering IT Operations across UOA Hospitality</span>
          <span className="hidden text-[#64748b] xl:inline">UOA HOSPITALITY</span>
        </footer>
      </section>

      <section className="auth-form-panel relative flex min-h-dvh items-center justify-center px-4 py-10 sm:px-8 lg:px-10">
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
          <ThemeToggle />
        </div>

        <div
          className={`w-full ${
            view === "signup" ? "max-w-2xl" : "max-w-md"
          }`}
        >
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img
              src="/uoah-logo.png"
              alt="UOA Hospitality"
              className="h-9 w-auto max-w-28 object-contain dark:brightness-0 dark:invert"
            />
            <span className="h-7 w-px bg-slate-300 dark:bg-slate-700" />
            <div>
              <p className="text-sm font-bold tracking-[0.2em] text-slate-900">UDESK</p>
              <p className="text-xs text-slate-500">Digital Support &amp; Knowledge</p>
            </div>
          </div>

          <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={view}
            data-auth-view={view}
            initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.99 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 360, damping: 32 }
            }
            className="auth-form-card rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_18px_60px_-32px_rgba(15,23,42,0.22)] sm:p-8"
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
          </m.div>
          </AnimatePresence>
        </div>
      </section>
    </main>
  );
}
