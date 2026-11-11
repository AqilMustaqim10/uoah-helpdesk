// The bar across the top: page title, ticket creation, and the account menu.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  ChevronDown,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  ShieldCheck,
  Ticket,
  UserCheck,
  X,
} from "lucide-react";
import type { User } from "../../types";
import { useNotifications } from "../../context/NotificationContext";
import { timeAgo, ticketRef } from "../../lib/format";
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
  mobileOpen: boolean;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onCreateTicket: () => void;
  onOpenTicket: (id: number) => void;
  onLogout: () => void;
}

export default function TopBar({
  title,
  user,
  mobileOpen,
  onOpenMenu,
  onCloseMenu,
  onCreateTicket,
  onOpenTicket,
  onLogout,
}: Props) {
  const reduceMotion = useReducedMotion();
  const [securityOpen, setSecurityOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
  } = useNotifications();
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const notificationsButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!accountMenuOpen && !notificationsOpen) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        accountMenuOpen &&
        !accountMenuRef.current?.contains(target)
      ) {
        setAccountMenuOpen(false);
      }
      if (
        notificationsOpen &&
        !notificationsRef.current?.contains(target)
      ) {
        setNotificationsOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        if (notificationsOpen) {
          setNotificationsOpen(false);
          notificationsButtonRef.current?.focus();
        } else {
          accountButtonRef.current?.focus();
        }
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountMenuOpen, notificationsOpen]);

  return (
    <>
      <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
        {/* Menu button only appears on phones */}
        <IconButton
          id="mobile-menu-button"
          label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-sidebar"
          className="md:hidden"
          onClick={mobileOpen ? onCloseMenu : onOpenMenu}
        >
          {mobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
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

          <div className="relative" ref={notificationsRef}>
            <m.button
              ref={notificationsButtonRef}
              type="button"
              data-motion-button="true"
              aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
              aria-haspopup="dialog"
              aria-expanded={notificationsOpen}
              aria-controls="notifications-menu"
              onClick={() => setNotificationsOpen((open) => !open)}
              whileHover={reduceMotion ? undefined : { scale: 1.06 }}
              whileTap={reduceMotion ? undefined : { scale: 0.92 }}
              transition={{ type: "spring", stiffness: 500, damping: 26 }}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Bell className="h-5 w-5" aria-hidden />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </m.button>
            <AnimatePresence>
              {notificationsOpen && (
              <m.div
                id="notifications-menu"
                role="dialog"
                aria-label="Notifications"
                initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -5, scale: 0.98 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 380, damping: 30 }
                }
                className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-surface text-foreground shadow-lg"
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold">Notifications</h2>
                    <p className="text-xs text-muted">
                      {unreadCount
                        ? `${unreadCount} unread`
                        : "You're all caught up"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={unreadCount === 0}
                    onClick={markAllAsRead}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-brand transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCheck className="h-4 w-4" aria-hidden />
                    Mark all as read
                  </button>
                </div>
                <div className="max-h-[min(65dvh,28rem)] overflow-y-auto p-2" data-lenis-prevent>
                  {notifications.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-muted">
                      No notifications yet.
                    </p>
                  ) : (
                    notifications.map((notification) => {
                      const NotificationIcon =
                        notification.type === "SLA_WARNING"
                          ? AlertTriangle
                          : notification.type === "ASSIGNED"
                            ? UserCheck
                            : notification.type === "NEW_TICKET"
                              ? Ticket
                              : MessageSquare;
                      return (
                        <m.button
                          key={notification.id}
                          type="button"
                          data-motion-button="true"
                          onClick={() => {
                            markAsRead(notification.id);
                            setNotificationsOpen(false);
                            onOpenTicket(notification.ticketId);
                          }}
                          whileHover={reduceMotion ? undefined : { x: 2 }}
                          whileTap={reduceMotion ? undefined : { scale: 0.99 }}
                          transition={{ type: "spring", stiffness: 460, damping: 30 }}
                          className={`flex w-full gap-3 rounded-lg px-3 py-3 text-left transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                            notification.isRead
                              ? "bg-surface text-muted"
                              : "bg-brand/5 text-foreground"
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                              notification.type === "SLA_WARNING"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-surface-muted text-brand"
                            }`}
                          >
                            <NotificationIcon
                              className="h-4 w-4"
                              aria-hidden
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span className="text-sm font-semibold">
                                {notification.title}
                              </span>
                              {!notification.isRead && (
                                <span
                                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand"
                                  aria-label="Unread"
                                />
                              )}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted">
                              {ticketRef(notification.ticketId)} ·{" "}
                              {notification.message}
                            </span>
                            <span className="mt-1.5 block text-[11px] text-muted">
                              {timeAgo(notification.createdAt)}
                            </span>
                          </span>
                        </m.button>
                      );
                    })
                  )}
                </div>
              </m.div>
              )}
            </AnimatePresence>
          </div>

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
