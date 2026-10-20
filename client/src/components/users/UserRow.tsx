// One person in the User Directory: who they are, plus their role, unit and enable/disable controls.
// Your OWN row is read-only (you cannot change your own role or disable yourself; the server enforces it too).
// New in step H: ADMIN and IT rows show whether two-factor authentication is on, with a "Reset 2FA" button
// for someone who lost their phone.
import { useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  UserCheck,
  UserX,
} from "lucide-react";
import { ApiError } from "../../api/client";
import { usersApi } from "../../api/users";
import { useToast } from "../../hooks/useToast";
import type { ManagedUser, Role, UnitOption } from "../../types";
import { formatDate } from "../../lib/format";
import { cn } from "../../lib/cn";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";
import ConfirmModal from "../ui/ConfirmModal";
import RoleBadge from "../ui/RoleBadge";

interface Props {
  user: ManagedUser;
  isSelf: boolean;
  units: UnitOption[];
  busy: boolean;
  onRole: (role: Role) => void;
  onUnit: (unitId: number) => void;
  onToggleActive: () => void;
}

const SELECT_CLASS =
  "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 transition " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:cursor-not-allowed disabled:opacity-60";

const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: "USER", label: "User" },
  { value: "IT", label: "IT staff" },
  { value: "ADMIN", label: "Administrator" },
];

export default function UserRow({
  user,
  isSelf,
  units,
  busy,
  onRole,
  onUnit,
  onToggleActive,
}: Props) {
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetDone, setResetDone] = useState(false); // after a reset this row shows "pending" without reloading the list

  const staffRole = user.role === "ADMIN" || user.role === "IT";
  const twoFactorOn = !!user.two_factor && !resetDone;

  async function doReset() {
    setResetBusy(true);
    try {
      await usersApi.reset2fa(user.id);
      setResetDone(true);
      setConfirmReset(false);
      toast.success(`Two-factor authentication was reset for ${user.name}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Could not reset. Please try again.",
      );
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <li
      className={cn(
        "flex animate-fade-in flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:gap-4",
        !user.is_active && "bg-slate-50",
      )}
    >
      {/* Who */}
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3",
          !user.is_active && "opacity-70",
        )}
      >
        <Avatar name={user.name} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-900">
              {user.name}
            </span>
            {isSelf && (
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                You
              </span>
            )}
            {!user.is_active && (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                Disabled
              </span>
            )}
            {staffRole &&
              (twoFactorOn ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  <ShieldCheck className="h-3 w-3" aria-hidden /> 2FA on
                </span>
              ) : (
                <span
                  title="They must set up an authenticator app the next time they sign in"
                  className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200"
                >
                  <ShieldAlert className="h-3 w-3" aria-hidden /> 2FA pending
                </span>
              ))}
          </div>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
          <p className="text-xs text-slate-400">
            Joined {formatDate(user.created_at)}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {isSelf ? (
          <RoleBadge role={user.role} />
        ) : (
          <select
            aria-label={`Role of ${user.name}`}
            className={SELECT_CLASS}
            value={user.role}
            disabled={busy}
            onChange={(e) => onRole(e.target.value as Role)}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}

        <select
          aria-label={`Business unit of ${user.name}`}
          className={SELECT_CLASS}
          value={user.business_unit_id ?? ""}
          disabled={busy}
          onChange={(e) => e.target.value && onUnit(Number(e.target.value))}
        >
          {user.business_unit_id === null && (
            <option value="" disabled>
              No unit
            </option>
          )}
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.code}
            </option>
          ))}
        </select>

        {!isSelf && twoFactorOn && (
          <Button
            size="sm"
            variant="ghost"
            icon={<ShieldOff className="h-4 w-4" />}
            disabled={busy}
            onClick={() => setConfirmReset(true)}
          >
            Reset 2FA
          </Button>
        )}

        {!isSelf && (
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            icon={
              user.is_active ? (
                <UserX className="h-4 w-4" />
              ) : (
                <UserCheck className="h-4 w-4" />
              )
            }
            onClick={onToggleActive}
          >
            {user.is_active ? "Disable" : "Enable"}
          </Button>
        )}
      </div>

      {user.business_unit_id === null && user.role !== "ADMIN" && (
        <p className="text-xs text-amber-700 lg:basis-full">
          This person has no business unit, so they cannot see or create
          tickets.
        </p>
      )}

      {confirmReset && (
        <ConfirmModal
          title={`Reset two-factor authentication for ${user.name}?`}
          message="Use this when they lost their phone and their recovery codes. They will be signed out everywhere, and must set up an authenticator app again the next time they sign in."
          confirmLabel="Reset 2FA"
          danger
          busy={resetBusy}
          onConfirm={() => void doReset()}
          onClose={() => setConfirmReset(false)}
        />
      )}
    </li>
  );
}
