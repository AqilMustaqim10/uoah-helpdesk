// The signed-in layout: sidebar + top bar + the page for the active tab.
// - the active tab is saved, and checked against your role when the app loads
// - the sidebar's collapsed state is saved too
// NOTE: hiding tabs is only cosmetic. The server decides what each role may do.
import { useEffect, useMemo, useState } from "react";
import type { TabKey, User } from "../../types";
import { TAB_STORAGE_KEY, defaultTabFor, tabsForRole } from "../../lib/nav";
import { getStored, setStored } from "../../lib/storage";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import PlaceholderPage from "../../pages/PlaceholderPage";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

const COLLAPSED_KEY = "sidebarCollapsed";

export default function AppShell({ user }: { user: User }) {
  const { logout } = useAuth();
  const toast = useToast();

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
          onCreateTicket={() =>
            toast.info("Creating tickets arrives in the next step.")
          }
          onLogout={logout}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* key={tab}: switching tabs replays a soft fade-in */}
          <div key={current.key} className="mx-auto max-w-6xl animate-fade-in">
            <PlaceholderPage
              title={current.label}
              description={current.soon}
              icon={current.icon}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
