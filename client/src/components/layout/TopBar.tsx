// The bar across the top: page title, Create Ticket, dark mode, who you are, security, logout.
import { useState } from "react";
import { LogOut, Menu, Plus, Search, ShieldCheck } from "lucide-react";
import { m } from "framer-motion";
import type { User } from "../../types";
import SecurityModal from "../auth/SecurityModal";
import Button from "../ui/Button";
import ErrorBoundary from "../ui/ErrorBoundary";
import IconButton from "../ui/IconButton";
import RoleBadge from "../ui/RoleBadge";
import ThemeToggle from "../ui/ThemeToggle";
import { MOD_KEY } from "../../lib/platform";
import { SPRING_TACTILE } from "../../lib/motion";

interface Props {
  title: string;
  user: User;
  onOpenMenu: () => void;
  onCreateTicket: () => void;
  onOpenPalette: () => void;
  onLogout: () => void;
}

export default function TopBar({
  title,
  user,
  onOpenMenu,
  onCreateTicket,
  onOpenPalette,
  onLogout,
}: Props) {
  const [securityOpen, setSecurityOpen] = useState(false);

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6">
        {/* Menu button only appears on phones */}
        <IconButton
          label="Open menu"
          className="md:hidden"
          onClick={onOpenMenu}
        >
          <Menu className="h-5 w-5" />
        </IconButton>

        <h1 className="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h1>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {/* Command palette (Cmd/Ctrl + K): a search-box-shaped button on wide screens, an icon on phones */}
          <m.button
            type="button"
            onClick={onOpenPalette}
            aria-label="Open command palette"
            aria-keyshortcuts="Control+K Meta+K"
            whileTap={{ scale: 0.98 }}
            transition={SPRING_TACTILE}
            className="hidden h-9 w-48 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm text-slate-500 transition-colors hover:border-slate-400 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 dark:hover:border-slate-600 md:flex lg:w-64"
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1 truncate text-left">Search or jump to…</span>
            <kbd className="rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] dark:border-slate-700">
              {MOD_KEY} K
            </kbd>
          </m.button>
          <IconButton
            label="Search"
            className="md:hidden"
            onClick={onOpenPalette}
          >
            <Search className="h-5 w-5" />
          </IconButton>

          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={onCreateTicket}
          >
            <span className="sr-only sm:not-sr-only">Create Ticket</span>
          </Button>

          {/* Only people who use two-factor authentication (ADMIN and IT) have a security window */}
          {user.two_factor && (
            <IconButton
              label="Security (two-factor authentication)"
              onClick={() => setSecurityOpen(true)}
            >
              <ShieldCheck className="h-5 w-5" />
            </IconButton>
          )}

          <ThemeToggle />

          <div className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-2 sm:pl-3">
            <span className="hidden max-w-[10rem] truncate text-sm font-medium text-slate-700 dark:text-slate-200 sm:block">
              {user.name}
            </span>
            <RoleBadge role={user.role} />
            <IconButton label="Sign out" onClick={onLogout}>
              <LogOut className="h-5 w-5" />
            </IconButton>
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
