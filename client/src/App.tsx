// Decides what to show: a spinner while we check the session,
// the sign-in screens if nobody is logged in, or the app itself.
import { m, useReducedMotion } from "framer-motion";
import { useAuth } from "./hooks/useAuth";
import AuthPage from "./pages/AuthPage";
import AppShell from "./components/layout/AppShell";
import { NotificationProvider } from "./context/NotificationContext";
import Skeleton, { CardSkeleton } from "./components/ui/Skeleton";

export default function App() {
  const { user, loading } = useAuth();
  const reduceMotion = useReducedMotion();

  if (loading) {
    return (
      <m.div
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.2 }}
        className="flex min-h-dvh bg-slate-50"
        aria-busy="true"
        aria-label="Loading helpdesk"
      >
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-5 lg:block">
          <Skeleton className="mb-9 h-10 w-36 rounded-xl" />
          <div className="space-y-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <div className="mb-7 flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <CardSkeleton key={index} />
            ))}
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Skeleton className="h-72 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
          </div>
        </main>
      </m.div>
    );
  }

  // key={user.id}: when a different person signs in, the shell starts fresh
  return user ? (
    <NotificationProvider key={user.id} user={user}>
      <AppShell user={user} />
    </NotificationProvider>
  ) : (
    <AuthPage />
  );
}
