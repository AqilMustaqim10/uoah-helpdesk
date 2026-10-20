// The "Add user" window.
//  - ADMIN: any business unit and any role (an ADMIN account needs a tick-box confirmation)
//  - IT:    the unit and the role are FIXED (their own unit, normal user). The server enforces this too.
// The person gets an invitation email and chooses their own password; nobody types a password here.
import { useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import { usersApi } from "../../api/users";
import { useDepartments } from "../../hooks/useDepartments";
import { useToast } from "../../hooks/useToast";
import { emailProblem } from "../../lib/validate";
import type { ManagedUser, Role, UnitOption, User } from "../../types";
import Button from "../ui/Button";
import FormError from "../ui/FormError";
import Input from "../ui/Input";
import Modal from "../ui/Modal";
import Select from "../ui/Select";

interface Props {
  actor: User;
  /** The business units (only ADMIN needs them). */
  units: UnitOption[];
  onClose: () => void;
  onCreated: (user: ManagedUser) => void;
}

export default function CreateUserModal({
  actor,
  units,
  onClose,
  onCreated,
}: Props) {
  const toast = useToast();
  const { departments, loading: departmentsLoading } = useDepartments();
  const isAdmin = actor.role === "ADMIN";
  const noUnit = !isAdmin && actor.business_unit_id === null;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [unitId, setUnitId] = useState("");
  const [role, setRole] = useState<Role>("USER");
  const [confirmAdmin, setConfirmAdmin] = useState(false);
  const [errors, setErrors] = useState<
    Partial<
      Record<"name" | "email" | "department" | "unit" | "confirm", string>
    >
  >({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || noUnit) return;

    const errs: typeof errors = {};
    if (!name.trim()) errs.name = "Name is required.";
    const ep = emailProblem(email);
    if (ep) errs.email = ep;
    if (!department) errs.department = "Choose a department.";
    if (isAdmin && !unitId) errs.unit = "Choose a business unit.";
    if (isAdmin && role === "ADMIN" && !confirmAdmin)
      errs.confirm =
        "Please confirm that this person should be an administrator.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setBusy(true);
    setFormError("");
    try {
      const r = await usersApi.create({
        email: email.trim(),
        name: name.trim(),
        department,
        // IT sends neither: the server uses their own unit and the USER role
        ...(isAdmin
          ? {
              business_unit_id: Number(unitId),
              role,
              ...(role === "ADMIN" ? { confirm: true } : {}),
            }
          : {}),
      });
      toast.success(
        `Account created for ${r.user.name}. An invitation email is on its way.`,
      );
      onCreated(r.user);
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setBusy(false);
    }
  }

  return (
    <Modal label="Add user" onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-4 p-6" noValidate>
        <div className="pr-10">
          <h2 className="text-lg font-semibold text-slate-900">Add user</h2>
          <p className="text-sm text-slate-500">
            The person receives an email with steps to choose their own
            password. Nobody else ever sees it.
          </p>
        </div>

        <FormError
          message={
            noUnit
              ? "Your account has no business unit, so you cannot add users."
              : formError
          }
        />

        <Input
          label="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          maxLength={100}
          autoFocus
        />
        <Input
          label="Company email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          placeholder="name@company.com"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            error={errors.department}
            disabled={departmentsLoading}
          >
            <option value="">
              {departmentsLoading ? "Loading…" : "Choose a department"}
            </option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>

          {isAdmin ? (
            <Select
              label="Business unit"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              error={errors.unit}
            >
              <option value="">Choose a unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.code})
                </option>
              ))}
            </Select>
          ) : (
            // IT: shown but fixed
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">
                Business unit
              </p>
              <p className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                {actor.branding?.name ?? "Your business unit"}
              </p>
            </div>
          )}
        </div>

        {isAdmin ? (
          <div className="space-y-2">
            <Select
              label="Role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="USER">User</option>
              <option value="IT">IT staff</option>
              <option value="ADMIN">Administrator</option>
            </Select>
            {role !== "USER" && (
              <p className="text-xs text-slate-500">
                This person will set up an authenticator app (two-factor) the
                first time they sign in.
              </p>
            )}
            {role === "ADMIN" && (
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={confirmAdmin}
                  onChange={(e) => setConfirmAdmin(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                />
                I understand that administrators see every ticket in every unit
                and manage all users.
              </label>
            )}
            {errors.confirm && (
              <p className="text-xs text-rose-600">{errors.confirm}</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            The account is a normal user account in your business unit.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={noUnit}>
            Create account
          </Button>
        </div>
      </form>
    </Modal>
  );
}
