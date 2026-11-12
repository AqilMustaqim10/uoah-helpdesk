// Decides what to show: a skeleton of the app while we check the session,
// the sign-in screens if nobody is logged in, or the app itself.
import { useAuth } from "./hooks/useAuth";
import { useRevealObserver } from "./hooks/useReveal";
import AuthPage from "./pages/AuthPage";
import AppShell from "./components/layout/AppShell";
import { AppBootSkeleton } from "./components/ui/skeletons";

export default function App() {
  const { user, loading } = useAuth();
  // Starts the staggered entrance (GSAP) for everything marked data-reveal, on every screen
  useRevealObserver();

  if (loading) return <AppBootSkeleton />;

  // key={user.id}: when a different person signs in, the shell starts fresh
  return user ? <AppShell key={user.id} user={user} /> : <AuthPage />;
}
