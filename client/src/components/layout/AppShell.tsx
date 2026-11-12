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
import CommandPalette from "../command/CommandPalette";
import SmoothScroll from "./SmoothScroll";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import HistoryPage from "../../pages/HistoryPage";

const COLLAPSED_KEY = "sidebarCollapsed";

export default function AppShell({ user }: { user: User }) {
  const { logout } = useAuth();
  const reduceMotion = useReducedMotion();

  const tabs = useMemo(() => tabsForRole(user.role), [user.role]);

  // Start on the saved tab, but ONLY if this role is allowed to see it
  const [tab, setTab] = useState<TabKey>(() => {
    const saved = getStored(TAB_STORAGE_KEY);
    const match = tabs.find((t) => t.key === saved);
    return match ? match.key : defaultTabFor(user.role);
  });
  const [collapsed, setCollapsed] = useState(
    () => getStored(COLLAPSED_KEY) === "1",
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingTicketFilters, setPendingTicketFilters] =
    useState<Partial<TicketQuery> | null>(null);
  // Bumped whenever filters are pushed to the Tickets tab, so it restarts with them even if it is already open
  const [ticketsKey, setTicketsKey] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Ticket windows + "reload the data" counter (the list and the dashboard both listen to it)
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const consumeTicketFilters = useCallback(
    () => setPendingTicketFilters(null),
    [],
  );
  const showTickets = useCallback((filters: Partial<TicketQuery>) => {
    setPendingTicketFilters(filters);
    setTicketsKey((k) => k + 1);
    setTab("tickets");
    setMobileOpen(false);
  }, []);

  // Cmd/Ctrl + K opens (or closes) the command palette from anywhere
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Safety net: if the current tab is not allowed for this role, go to the default one
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab(defaultTabFor(user.role));
  }, [tabs, tab, user.role]);

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
    setMobileOpen(false); // close the phone drawer after choosing
  }

  const current = tabs.find((t) => t.key === tab) ?? tabs[0];

  /** The page for the active tab. */
  function page(): ReactNode {
    switch (current.key) {
      case "tickets":
        return (
          <TicketsPage
            key={ticketsKey}
            user={user}
            version={version}
            onOpen={setSelectedId}
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
            onManage={user.role === "ADMIN" ? setSelectedId : undefined}
          />
        );
      case "dashboard":
        return (
          <DashboardPage
            user={user}
            version={version}
            onOpen={setSelectedId}
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
    <div className="flex h-dvh overflow-hidden bg-slate-50 dark:bg-[#090d16]">
      {/* Dark backdrop behind the phone drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <m.div
            key="menu-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
        )}
      </AnimatePresence>

      <Sidebar
        tabs={tabs}
        active={current.key}
        onSelect={selectTab}
        branding={user.branding}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={current.label}
          user={user}
          onOpenMenu={() => setMobileOpen(true)}
          onCreateTicket={() => setCreateOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
          onLogout={logout}
        />
        <SmoothScroll className="p-4 sm:p-6" resetKey={current.key}>
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={current.key}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.14, ease: "easeOut" }}
              className="mx-auto max-w-6xl"
            >
              <ErrorBoundary resetKey={current.key}>{page()}</ErrorBoundary>
            </m.div>
          </AnimatePresence>
        </SmoothScroll>
      </div>

      {createOpen && (
        <ErrorBoundary onClose={() => setCreateOpen(false)}>
          <CreateTicketModal
            user={user}
            onClose={() => setCreateOpen(false)}
            onCreated={(id) => {
              setCreateOpen(false);
              setTab("tickets"); // show the new ticket in the list...
              refresh();
              setSelectedId(id); // ...and open it
            }}
          />
        </ErrorBoundary>
      )}

      {selectedId !== null && (
        <ErrorBoundary onClose={() => setSelectedId(null)}>
          <TicketModal
            key={selectedId}
            ticketId={selectedId}
            user={user}
            onClose={() => setSelectedId(null)}
            onChanged={refresh}
          />
        </ErrorBoundary>
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        user={user}
        tabs={tabs}
        onNavigate={selectTab}
        onOpenTicket={setSelectedId}
        onCreateTicket={() => setCreateOpen(true)}
        onShowTickets={showTickets}
        onLogout={logout}
      />
    </div>
  );
}
