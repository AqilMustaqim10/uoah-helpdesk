// The signed-in layout: sidebar + top bar + the page for the active tab,
// plus the two ticket windows (Create Ticket and the ticket itself).
// - the active tab is saved, and checked against your role when the app loads
// - the sidebar's collapsed state is saved too
// - every page and window sits inside an ErrorBoundary, so a crash shows a friendly card, not a blank page
// NOTE: hiding tabs is only cosmetic. The server decides what each role may do.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import type { TabKey, TicketQuery, User } from "../../types";
import { TAB_STORAGE_KEY, defaultTabFor, tabsForRole } from "../../lib/nav";
import { getStored, setStored } from "../../lib/storage";
import { useAuth } from "../../hooks/useAuth";
import DashboardPage from "../../pages/DashboardPage";
import KnowledgeBasePage from "../../pages/KnowledgeBasePage";
import SettingsPage from "../../pages/SettingsPage";
import TicketsPage from "../../pages/TicketsPage";
import UsersPage from "../../pages/UsersPage";
import CreateTicketModal from "../tickets/CreateTicketModal";
import TicketModal from "../tickets/TicketModal";
import ErrorBoundary from "../ui/ErrorBoundary";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import HistoryPage from "../../pages/HistoryPage";

const COLLAPSED_KEY = "sidebarCollapsed";
const TAB_PATHS: Record<TabKey, string> = {
  dashboard: "/dashboard",
  tickets: "/tickets",
  history: "/history",
  kb: "/kb",
  users: "/users",
  settings: "/settings",
};

function routeFromLocation(
  tabs: Array<{ key: TabKey }>,
  fallback: TabKey,
): { tab: TabKey; ticketId: number | null } {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const ticket = /^\/tickets\/(?:TKT-)?(\d+)$/i.exec(path);
  if (ticket && tabs.some((item) => item.key === "tickets")) {
    const id = Number(ticket[1]);
    if (Number.isSafeInteger(id) && id > 0) {
      return { tab: "tickets", ticketId: id };
    }
  }
  const match = Object.entries(TAB_PATHS).find(([, route]) => route === path);
  if (match && tabs.some((item) => item.key === match[0])) {
    return { tab: match[0] as TabKey, ticketId: null };
  }
  return { tab: fallback, ticketId: null };
}

export default function AppShell({ user }: { user: User }) {
  const { logout } = useAuth();
  const reduceMotion = useReducedMotion();

  const tabs = useMemo(() => tabsForRole(user.role), [user.role]);
  const savedTab = getStored(TAB_STORAGE_KEY);
  const fallbackTab =
    tabs.find((t) => t.key === savedTab)?.key ?? defaultTabFor(user.role);

  // The URL takes precedence over the saved tab, making shared ticket links work.
  const [tab, setTab] = useState<TabKey>(() => {
    return routeFromLocation(tabs, fallbackTab).tab;
  });
  const [collapsed, setCollapsed] = useState(
    () => getStored(COLLAPSED_KEY) === "1",
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingTicketFilters, setPendingTicketFilters] =
    useState<Partial<TicketQuery> | null>(null);

  // Ticket windows + "reload the data" counter (the list and the dashboard both listen to it)
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(
    () => routeFromLocation(tabs, fallbackTab).ticketId,
  );
  const confirmedDrawerClose = useRef(false);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const consumeTicketFilters = useCallback(
    () => setPendingTicketFilters(null),
    [],
  );
  const showTickets = useCallback((filters: Partial<TicketQuery>) => {
    setPendingTicketFilters(filters);
    setTab("tickets");
    setSelectedId(null);
    if (window.location.pathname !== TAB_PATHS.tickets) {
      window.history.pushState({}, "", TAB_PATHS.tickets);
    }
    setMobileOpen(false);
  }, []);

  const openTicket = useCallback((id: number) => {
    const path = `${TAB_PATHS.tickets}/TKT-${id}`;
    if (window.location.pathname !== path) {
      window.history.pushState(
        { ticketParent: window.location.pathname },
        "",
        path,
      );
    }
    setTab("tickets");
    setSelectedId(id);
    setMobileOpen(false);
  }, []);

  const closeTicket = useCallback(() => {
    if (selectedId === null) return;
    if (
      typeof window.history.state?.ticketParent === "string" &&
      window.history.state.ticketParent.startsWith("/")
    ) {
      confirmedDrawerClose.current = true;
      window.history.back();
      return;
    }
    window.history.replaceState({}, "", TAB_PATHS.tickets);
    setTab("tickets");
    setSelectedId(null);
  }, [selectedId]);

  // Safety net: if the current tab is not allowed for this role, go to the default one
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab(defaultTabFor(user.role));
  }, [tabs, tab, user.role]);

  useEffect(() => {
    if (selectedId === null && window.location.pathname !== TAB_PATHS[tab]) {
      window.history.replaceState({}, "", TAB_PATHS[tab]);
    }
  }, [selectedId, tab]);

  useEffect(() => {
    function syncRoute() {
      const route = routeFromLocation(tabs, fallbackTab);
      const alreadyConfirmed = confirmedDrawerClose.current;
      confirmedDrawerClose.current = false;
      if (
        !alreadyConfirmed &&
        selectedId !== null &&
        route.ticketId !== selectedId
      ) {
        try {
          const draft = window.sessionStorage.getItem(
            `ticket-reply-draft:${user.id}:${selectedId}`,
          );
          if (
            draft?.trim() &&
            !window.confirm(
              "This ticket has an unsent reply draft. Close without sending it?",
            )
          ) {
            window.history.forward();
            return;
          }
        } catch {
          // A route change must remain possible when session storage is disabled.
        }
      }
      setTab(route.tab);
      setSelectedId(route.ticketId);
    }
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, [tabs, fallbackTab, selectedId, user.id]);

  useEffect(() => {
    setStored(TAB_STORAGE_KEY, tab);
  }, [tab]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    setStored(COLLAPSED_KEY, next ? "1" : "0");
  }

  function selectTab(key: TabKey) {
    setTab(key);
    setSelectedId(null);
    if (window.location.pathname !== TAB_PATHS[key]) {
      window.history.pushState({}, "", TAB_PATHS[key]);
    }
    setMobileOpen(false); // close the phone drawer after choosing
  }

  const current = tabs.find((t) => t.key === tab) ?? tabs[0];

  /** The page for the active tab. */
  function page(): ReactNode {
    switch (current.key) {
      case "tickets":
        return (
          <TicketsPage
            user={user}
            version={version}
            onOpen={openTicket}
            onCreate={() => setCreateOpen(true)}
            initialFilters={pendingTicketFilters}
            onInitialFiltersApplied={consumeTicketFilters}
          />
        );
      case "history":
        // ADMIN gets a way to open the full ticket window; IT gets none (view only)
        return (
          <HistoryPage
            user={user}
            version={version}
            onManage={user.role === "ADMIN" ? openTicket : undefined}
          />
        );
      case "dashboard":
        return (
          <DashboardPage
            user={user}
            version={version}
            onOpen={openTicket}
            onShowTickets={showTickets}
          />
        );
      case "kb":
        return <KnowledgeBasePage user={user} />;
      case "users":
        return <UsersPage user={user} />;
      case "settings":
        return <SettingsPage user={user} />;
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-50">
      {/* Dark backdrop behind the phone drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 animate-fade-in bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <Sidebar
        tabs={tabs}
        active={current.key}
        onSelect={selectTab}
        branding={user.branding}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={current.label}
          user={user}
          mobileOpen={mobileOpen}
          onOpenMenu={() => setMobileOpen(true)}
          onCloseMenu={() => setMobileOpen(false)}
          onCreateTicket={() => setCreateOpen(true)}
          onOpenTicket={openTicket}
          onLogout={logout}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={current.key}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: reduceMotion ? 0 : 0.16, ease: "easeOut" }}
              className="mx-auto max-w-6xl"
            >
              <ErrorBoundary resetKey={current.key}>{page()}</ErrorBoundary>
            </m.div>
          </AnimatePresence>
        </main>
      </div>

      {createOpen && (
        <ErrorBoundary onClose={() => setCreateOpen(false)}>
          <CreateTicketModal
            user={user}
            onClose={() => setCreateOpen(false)}
            onCreated={(id) => {
              setCreateOpen(false);
              setTab("tickets");
              refresh();
              openTicket(id);
            }}
          />
        </ErrorBoundary>
      )}

      {selectedId !== null && (
        <ErrorBoundary onClose={closeTicket}>
          <TicketModal
            key={selectedId}
            ticketId={selectedId}
            user={user}
            onClose={closeTicket}
            onChanged={refresh}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
