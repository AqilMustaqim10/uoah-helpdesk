// Decides what to show: a spinner while we check the session,
// the sign-in screens if nobody is logged in, or the app itself.
import { Loader2 } from "lucide-react";
import { useAuth } from "./hooks/useAuth";
import AuthPage from "./pages/AuthPage";
import AppShell from "./components/layout/AppShell";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-50">
        <Loader2
          className="h-6 w-6 animate-spin text-slate-400"
          aria-label="Loading"
        />
      </div>
    );
  }

  // key={user.id}: when a different person signs in, the shell starts fresh
  return user ? <AppShell key={user.id} user={user} /> : <AuthPage />;
}
