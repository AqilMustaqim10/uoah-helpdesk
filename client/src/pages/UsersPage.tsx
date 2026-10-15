// The User Directory tab (ADMIN only): search, filter, change role / unit, enable / disable.
// There is no delete: people are only ever disabled.
import { useEffect, useRef, useState } from "react";
import { Search, SearchX, Users as UsersIcon } from "lucide-react";
import { authApi } from "../api/auth";
import { ApiError } from "../api/client";
import { usersApi } from "../api/users";
import { useAuth } from "../hooks/useAuth";
import { useDebounce } from "../hooks/useDebounce";
import { useToast } from "../hooks/useToast";
import { cn } from "../lib/cn";
import type {
  ManagedUser,
  Role,
  UnitOption,
  User,
  UserListResponse,
  UserQuery,
} from "../types";
import UserRow from "../components/users/UserRow";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import EmptyState from "../components/ui/EmptyState";
import FormError from "../components/ui/FormError";
import Pagination from "../components/ui/Pagination";
import Skeleton from "../components/ui/Skeleton";

const EMPTY_QUERY: UserQuery = {
  q: "",
  role: "",
  status: "",
  unit: "",
  page: 1,
};

const SELECT_CLASS =
  "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 transition " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

const ROLE_LABEL: Record<Role, string> = {
  USER: "User",
  IT: "IT staff",
  ADMIN: "Administrator",
};

/** An action waiting for the "Are you sure?" window. */
type Pending =
  | { kind: "role"; user: ManagedUser; role: Role }
  | { kind: "disable"; user: ManagedUser }
  | null;

export default function UsersPage({ user: me }: { user: User }) {
  const toast = useToast();
  const { refresh } = useAuth();

  const [query, setQuery] = useState<UserQuery>(EMPTY_QUERY);
  const [text, setText] = useState("");
  const debounced = useDebounce(text, 300);
  const [data, setData] = useState<UserListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    authApi
      .units()
      .then((r) => setUnits(r.units))
      .catch(() => undefined);
  }, []);

  // The search runs 300 ms after you stop typing
  useEffect(() => {
    setQuery((q) => (q.q === debounced ? q : { ...q, q: debounced, page: 1 }));
  }, [debounced]);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    usersApi
      .list(query)
      .then((r) => {
        if (id === requestId.current) setData(r);
      })
      .catch((err) => {
        if (id === requestId.current)
          setError(
            err instanceof ApiError ? err.message : "Could not load users.",
          );
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [query]);

  // If the current page no longer exists, go back to page 1
  useEffect(() => {
    if (data && data.users.length === 0 && data.total > 0 && query.page > 1) {
      setQuery((q) => ({ ...q, page: 1 }));
    }
  }, [data, query.page]);

  function change(patch: Partial<UserQuery>) {
    setQuery((q) => ({ ...q, ...patch, page: patch.page ?? 1 }));
  }

  function replaceUser(updated: ManagedUser) {
    setData((d) =>
      d
        ? {
            ...d,
            users: d.users.map((u) => (u.id === updated.id ? updated : u)),
          }
        : d,
    );
  }

  /** Runs one change, shows the result as a toast, and returns whether it worked. */
  async function runChange(
    id: number,
    action: () => Promise<{ user: ManagedUser }>,
    message: string,
  ): Promise<boolean> {
    setBusyId(id);
    try {
      const r = await action();
      replaceUser(r.user);
      toast.success(message);
      return true;
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
      return false;
    } finally {
      setBusyId(null);
    }
  }

  function requestRole(target: ManagedUser, role: Role) {
    if (role === target.role) return;
    // Giving or taking away administrator power always asks first
    if (role === "ADMIN" || target.role === "ADMIN") {
      setPending({ kind: "role", user: target, role });
      return;
    }
    void runChange(
      target.id,
      () => usersApi.setRole(target.id, role, false),
      `${target.name} is now ${ROLE_LABEL[role]}`,
    );
  }

  function requestToggle(target: ManagedUser) {
    if (target.is_active) {
      setPending({ kind: "disable", user: target });
    } else {
      void runChange(
        target.id,
        () => usersApi.setActive(target.id, true),
        `${target.name} was enabled`,
      );
    }
  }

  async function confirmPending() {
    if (!pending) return;
    const p = pending;
    setConfirmBusy(true);
    if (p.kind === "role") {
      await runChange(
        p.user.id,
        () => usersApi.setRole(p.user.id, p.role, true),
        `${p.user.name} is now ${ROLE_LABEL[p.role]}`,
      );
    } else {
      await runChange(
        p.user.id,
        () => usersApi.setActive(p.user.id, false),
        `${p.user.name} was disabled`,
      );
    }
    setConfirmBusy(false);
    setPending(null);
  }

  const filtersActive = !!(query.q || query.role || query.status || query.unit);
  const firstLoad = loading && !data;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={100}
            placeholder="Search by name or email"
            aria-label="Search users"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by role"
            className={SELECT_CLASS}
            value={query.role}
            onChange={(e) =>
              change({ role: e.target.value as UserQuery["role"] })
            }
          >
            <option value="">All roles</option>
            <option value="ADMIN">Administrators</option>
            <option value="IT">IT staff</option>
            <option value="USER">Users</option>
          </select>
          <select
            aria-label="Filter by status"
            className={SELECT_CLASS}
            value={query.status}
            onChange={(e) =>
              change({ status: e.target.value as UserQuery["status"] })
            }
          >
            <option value="">Active and disabled</option>
            <option value="active">Active only</option>
            <option value="disabled">Disabled only</option>
          </select>
          <select
            aria-label="Filter by business unit"
            className={SELECT_CLASS}
            value={query.unit}
            onChange={(e) => change({ unit: e.target.value })}
          >
            <option value="">All units</option>
            <option value="none">No unit</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code}
              </option>
            ))}
          </select>
        </div>
      </div>

      <FormError message={error} />

      {firstLoad ? (
        <div
          className="space-y-px overflow-hidden rounded-2xl border border-slate-200 bg-white"
          aria-busy="true"
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2 px-4 py-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : data && data.users.length > 0 ? (
        <>
          <p className="text-sm text-slate-500">
            {data.total} {data.total === 1 ? "person" : "people"}
          </p>
          <ul
            className={cn(
              "divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-opacity",
              loading && "opacity-60",
            )}
          >
            {data.users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                isSelf={u.id === me.id}
                units={units}
                busy={busyId === u.id}
                onRole={(role) => requestRole(u, role)}
                onUnit={(unitId) =>
                  void runChange(
                    u.id,
                    () => usersApi.setUnit(u.id, unitId),
                    `${u.name} was moved`,
                  ).then((ok) => {
                    // Your own unit decides your sidebar logo and color
                    if (ok && u.id === me.id) void refresh();
                  })
                }
                onToggleActive={() => requestToggle(u)}
              />
            ))}
          </ul>
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPage={(page) => change({ page })}
          />
        </>
      ) : data && !error ? (
        filtersActive ? (
          <EmptyState
            icon={SearchX}
            title="No one matches your filters"
            description="Try a different search or clear the filters."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setText("");
                  setQuery(EMPTY_QUERY);
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={UsersIcon}
            title="No users yet"
            description="People appear here after they register."
          />
        )
      ) : null}

      {pending && (
        <ConfirmModal
          title={
            pending.kind === "disable"
              ? `Disable ${pending.user.name}?`
              : pending.role === "ADMIN"
                ? `Make ${pending.user.name} an administrator?`
                : `Change ${pending.user.name} from administrator to ${ROLE_LABEL[pending.role]}?`
          }
          message={
            pending.kind === "disable"
              ? "They will be signed out and cannot sign in until you enable the account again. Their tickets and comments are kept."
              : pending.role === "ADMIN"
                ? "Administrators can see every ticket in every business unit and manage all users and settings."
                : "They will lose access to other business units and to the User Directory and Settings."
          }
          confirmLabel={pending.kind === "disable" ? "Disable" : "Confirm"}
          danger={pending.kind === "disable"}
          busy={confirmBusy}
          onConfirm={() => void confirmPending()}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  );
}
