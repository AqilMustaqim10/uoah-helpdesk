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
import type { TabKey, User } from "../../types";
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

export default function AppShell({ user }: { user: User }) {
  const { logout } = useAuth();

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

  // Ticket windows + "reload the data" counter (the list and the dashboard both listen to it)
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

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
            user={user}
            version={version}
            onOpen={setSelectedId}
            onCreate={() => setCreateOpen(true)}
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
          <DashboardPage user={user} version={version} onOpen={setSelectedId} />
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
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={current.label}
          user={user}
          onOpenMenu={() => setMobileOpen(true)}
          onCreateTicket={() => setCreateOpen(true)}
          onLogout={logout}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* key={tab}: switching tabs replays a soft fade-in. resetKey: a crashed page recovers when you change tab. */}
          <div key={current.key} className="mx-auto max-w-6xl animate-fade-in">
            <ErrorBoundary resetKey={current.key}>{page()}</ErrorBoundary>
          </div>
        </main>
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
    </div>
  );
}
