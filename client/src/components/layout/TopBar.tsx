// The bar across the top: page title, ticket creation, and the account menu.
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Menu, Plus, ShieldCheck } from "lucide-react";
import type { User } from "../../types";
import SecurityModal from "../auth/SecurityModal";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";
import ErrorBoundary from "../ui/ErrorBoundary";
import IconButton from "../ui/IconButton";
import RoleBadge from "../ui/RoleBadge";
import ThemeToggle from "../ui/ThemeToggle";

interface Props {
  title: string;
  user: User;
  onOpenMenu: () => void;
  onCreateTicket: () => void;
  onLogout: () => void;
}

export default function TopBar({
  title,
  user,
  onOpenMenu,
  onCreateTicket,
  onLogout,
}: Props) {
  const [securityOpen, setSecurityOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!accountMenuOpen) return;

    function onPointerDown(event: PointerEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        accountButtonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountMenuOpen]);

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
        {/* Menu button only appears on phones */}
        <IconButton
          label="Open menu"
          className="md:hidden"
          onClick={onOpenMenu}
        >
          <Menu className="h-5 w-5" />
        </IconButton>

        <h1 className="truncate text-lg font-semibold text-foreground">
          {title}
        </h1>

        <div className="flex-1" aria-hidden="true" />

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={onCreateTicket}
          >
            <span className="sr-only sm:not-sr-only">Create Ticket</span>
          </Button>

          <div className="relative" ref={accountMenuRef}>
            <button
              ref={accountButtonRef}
              type="button"
              aria-label="Open account menu"
              aria-haspopup="dialog"
              aria-expanded={accountMenuOpen}
              aria-controls="account-menu"
              onClick={() => setAccountMenuOpen((open) => !open)}
              className="inline-flex h-10 items-center gap-2 rounded-full p-1 pr-2 text-muted transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Avatar name={user.name} />
              <ChevronDown
                className={`h-4 w-4 transition-transform ${accountMenuOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>

            {accountMenuOpen && (
              <div
                id="account-menu"
                role="dialog"
                aria-label="Account options"
                className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-border bg-surface p-2 text-foreground shadow-lg"
              >
                <div className="border-b border-border px-3 py-2">
                  <p className="truncate text-sm font-semibold">{user.name}</p>
                  <div className="mt-1">
                    <RoleBadge role={user.role} />
                  </div>
                </div>

                {user.two_factor && (
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setSecurityOpen(true);
                    }}
                    className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-muted transition hover:bg-surface-muted hover:text-foreground"
                  >
                    <ShieldCheck className="h-4 w-4" aria-hidden />
                    Security
                  </button>
                )}

                <div className="flex h-11 items-center justify-between rounded-lg px-3 text-sm text-muted">
                  <span>Theme</span>
                  <ThemeToggle />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    onLogout();
                  }}
                  className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-muted transition hover:bg-surface-muted hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {securityOpen && (
        <ErrorBoundary onClose={() => setSecurityOpen(false)}>
          <SecurityModal onClose={() => setSecurityOpen(false)} />
        </ErrorBoundary>
      )}
    </>
  );
}
