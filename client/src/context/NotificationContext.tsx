import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { notificationsApi } from "../api/notifications";
import { useToast } from "../hooks/useToast";
import { getStored, setStored } from "../lib/storage";
import type { Notification, User } from "../types";

interface NotificationValue {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
}

const NotificationContext = createContext<NotificationValue | null>(null);

function readStoredIds(userId: number): Set<string> {
  const stored = getStored(`notifications-read:${userId}`);
  if (!stored) return new Set();
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === "string")
      ? new Set(parsed)
      : new Set();
  } catch {
    return new Set();
  }
}

export function NotificationProvider({
  user,
  children,
}: {
  user: User;
  children: ReactNode;
}) {
  const toast = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState(() => readStoredIds(user.id));
  const readIdsRef = useRef(readIds);
  const loadErrorShown = useRef(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await notificationsApi.list();
        if (active) {
          setNotifications(
            response.notifications.map((notification) => ({
              ...notification,
              isRead:
                notification.isRead || readIdsRef.current.has(notification.id),
            })),
          );
          loadErrorShown.current = false;
        }
      } catch (error) {
        if (active && !loadErrorShown.current) {
          loadErrorShown.current = true;
          toast.error(
            error instanceof Error
              ? `Notifications could not be loaded: ${error.message}`
              : "Notifications could not be loaded.",
          );
        }
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [toast]);

  const markAsRead = useCallback(
    (id: string) => {
      setReadIds((current) => {
        const next = new Set(current);
        next.add(id);
        readIdsRef.current = next;
        setStored(
          `notifications-read:${user.id}`,
          JSON.stringify(Array.from(next).slice(-500)),
        );
        return next;
      });
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === id
            ? { ...notification, isRead: true }
            : notification,
        ),
      );
    },
    [user.id],
  );

  const markAllAsRead = useCallback(() => {
    setReadIds((current) => {
      const next = new Set(current);
      notifications.forEach((notification) => next.add(notification.id));
      readIdsRef.current = next;
      setStored(
        `notifications-read:${user.id}`,
        JSON.stringify(Array.from(next).slice(-500)),
      );
      return next;
    });
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, isRead: true })),
    );
  }, [notifications, user.id]);

  const value = useMemo<NotificationValue>(
    () => ({
      notifications,
      unreadCount: notifications.reduce(
        (count, notification) => count + (notification.isRead ? 0 : 1),
        0,
      ),
      markAsRead,
      markAllAsRead,
    }),
    [notifications, markAsRead, markAllAsRead],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationValue {
  const value = useContext(NotificationContext);
  if (!value) {
    throw new Error(
      "useNotifications must be used inside <NotificationProvider>",
    );
  }
  return value;
}
