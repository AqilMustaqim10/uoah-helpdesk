// Who is logged in. Keeps the user, checks the session on page load,
// applies the business unit's brand color, and handles "session ended".
// New in step H: login() may answer "a second step is needed" instead of signing in.
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { authApi } from "../api/auth";
import { setUnauthorizedHandler } from "../api/client";
import { useToast } from "../hooks/useToast";
import type { User } from "../types";

/** 'ok' = signed in. Otherwise the password was right and the second step is 'verify' (enter a code) or 'setup'. */
export type LoginOutcome = "ok" | "verify" | "setup";

export interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  logout: () => Promise<void>;
  /** Used after sign up and after the second step, which sign the person in. */
  setUser: (user: User) => void;
  /** Asks the server for the latest version of the logged-in user (for example after a branding change). */
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // A copy of "user" that the unauthorized handler can read without re-registering.
  const userRef = useRef<User | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // On page load: ask the server "am I still signed in?"
  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then((r) => !cancelled && setUserState(r.user))
      .catch(() => !cancelled && setUserState(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // If ANY later request gets 401 (session expired, password changed, account disabled, 2FA reset):
  // go back to the sign-in screen with a short message.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (userRef.current) {
        setUserState(null);
        toast.info("Your session has ended. Please sign in again.");
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [toast]);

  // Brand color: the unit's color becomes the primary color (buttons, active tab).
  const brandColor = user?.branding?.brandColor;
  useEffect(() => {
    const root = document.documentElement;
    if (brandColor) root.style.setProperty("--brand", brandColor);
    else root.style.removeProperty("--brand"); // back to the default blue
  }, [brandColor]);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginOutcome> => {
      const r = await authApi.login(email, password);
      if ("mfa" in r) return r.mfa; // the second step is still needed; nobody is signed in yet
      setUserState(r.user);
      return "ok";
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* even if the server cannot be reached, sign out on this screen */
    }
    setUserState(null);
    toast.info("Signed out.");
  }, [toast]);

  const refresh = useCallback(async () => {
    try {
      const r = await authApi.me();
      setUserState(r.user);
    } catch {
      /* a 401 is handled by the handler above; other errors can be ignored here */
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, loading, login, logout, setUser: setUserState, refresh }),
    [user, loading, login, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
