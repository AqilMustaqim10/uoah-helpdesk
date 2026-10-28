// The Departments section of Settings (ADMIN only): add, rename, hide / show and delete departments.
//  - rename also updates everyone who has the department
//  - hide: no longer offered in forms, but people who have it keep it
//  - delete: when people have it, they are moved to another department you choose
import { useEffect, useState, type FormEvent } from "react";
import {
  Building2,
  Check,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { ApiError } from "../../api/client";
import { departmentsApi, type DepartmentRow } from "../../api/departments";
import { clearDepartmentsCache } from "../../hooks/useDepartments";
import { useToast } from "../../hooks/useToast";
import { cn } from "../../lib/cn";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import FormError from "../ui/FormError";
import IconButton from "../ui/IconButton";
import Input from "../ui/Input";
import Skeleton from "../ui/Skeleton";
import DeleteDepartmentModal from "./DeleteDepartmentModal";

export default function DepartmentsSettings() {
  const toast = useToast();
  const [rows, setRows] = useState<DepartmentRow[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [deleting, setDeleting] = useState<DepartmentRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let cancelled = false;
    departmentsApi
      .list()
      .then((r) => !cancelled && setRows(r.departments))
      .catch(
        (err) =>
          !cancelled &&
          setLoadError(
            err instanceof ApiError
              ? err.message
              : "Could not load the departments.",
          ),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  /** A change worked: show the new list, make the forms ask the server again, and say so. */
  function applied(list: DepartmentRow[], message: string) {
    setRows(list);
    clearDepartmentsCache();
    toast.success(message);
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (name.length < 2 || adding) return;
    setAdding(true);
    try {
      const r = await departmentsApi.create(name);
      setNewName("");
      applied(r.departments, `Department "${name}" added`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not add the department.",
      );
    } finally {
      setAdding(false);
    }
  }

  async function saveRename(d: DepartmentRow) {
    const name = editText.trim();
    if (name === d.name) {
      setEditingId(null);
      return;
    }
    if (name.length < 2) {
      toast.error("The name needs at least 2 characters.");
      return;
    }
    setBusyId(d.id);
    try {
      const r = await departmentsApi.update(d.id, { name });
      setEditingId(null);
      applied(
        r.departments,
        d.users > 0
          ? `Renamed. ${d.users} ${d.users === 1 ? "person was" : "people were"} updated.`
          : "Renamed",
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Could not rename the department.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function toggle(d: DepartmentRow) {
    setBusyId(d.id);
    try {
      const r = await departmentsApi.update(d.id, { is_active: !d.is_active });
      applied(
        r.departments,
        d.is_active
          ? `"${d.name}" is now hidden`
          : `"${d.name}" is visible again`,
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Could not change the department.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete(moveTo: number | undefined) {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      const r = await departmentsApi.remove(deleting.id, moveTo);
      applied(r.departments, `Department "${deleting.name}" deleted`);
      setDeleting(null);
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? err.message
          : "Could not delete the department.",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  const visibleCount = rows?.filter((r) => r.is_active).length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Departments</h2>
        <p className="text-sm text-slate-500">
          People choose one when they register, and administrators or IT choose
          one when they add a person. Renaming updates everyone who has it. A
          hidden department is no longer offered, but people who have it keep
          it.
        </p>
      </div>

      {/* Add */}
      <form
        onSubmit={(e) => void add(e)}
        className="flex flex-wrap items-end gap-2"
      >
        <div className="min-w-[14rem] flex-1">
          <Input
            label="New department"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={60}
            placeholder="For example: Banquet & Events"
          />
        </div>
        <Button
          type="submit"
          icon={<Plus className="h-4 w-4" />}
          loading={adding}
          disabled={newName.trim().length < 2}
        >
          Add
        </Button>
      </form>

      {rows && visibleCount === 0 && (
        <FormError message="No department is visible, so nobody can register. Show or add one." />
      )}

      {loadError ? (
        <FormError message={loadError} />
      ) : !rows ? (
        <div
          className="space-y-px overflow-hidden rounded-2xl border border-slate-200 bg-white"
          aria-busy="true"
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-4 py-4">
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No departments yet"
          description="Add the first one above."
        />
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.map((d) => {
            const editing = editingId === d.id;
            const busy = busyId === d.id;
            return (
              <li
                key={d.id}
                className="flex animate-fade-in flex-wrap items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveRename(d);
                      }}
                      className="flex items-center gap-1"
                    >
                      <input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        maxLength={60}
                        autoFocus
                        aria-label={`New name for ${d.name}`}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                      />
                      <IconButton
                        label="Save the new name"
                        type="submit"
                        disabled={busy}
                      >
                        <Check className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        label="Cancel"
                        onClick={() => setEditingId(null)}
                        disabled={busy}
                      >
                        <X className="h-4 w-4" />
                      </IconButton>
                    </form>
                  ) : (
                    <>
                      <p
                        className={cn(
                          "truncate text-sm font-medium",
                          d.is_active ? "text-slate-900" : "text-slate-400",
                        )}
                      >
                        {d.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {d.users} {d.users === 1 ? "person" : "people"}
                      </p>
                    </>
                  )}
                </div>

                {!d.is_active && !editing && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                    Hidden
                  </span>
                )}

                {!editing && (
                  <div className="flex items-center gap-1">
                    <IconButton
                      label={`Rename ${d.name}`}
                      disabled={busy}
                      onClick={() => {
                        setEditingId(d.id);
                        setEditText(d.name);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      label={d.is_active ? `Hide ${d.name}` : `Show ${d.name}`}
                      disabled={busy}
                      onClick={() => void toggle(d)}
                    >
                      {d.is_active ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </IconButton>
                    <button
                      type="button"
                      aria-label={`Delete ${d.name}`}
                      title={`Delete ${d.name}`}
                      disabled={busy}
                      onClick={() => {
                        setDeleteError("");
                        setDeleting(d);
                      }}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-rose-600 transition hover:bg-rose-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {deleting && rows && (
        <DeleteDepartmentModal
          department={deleting}
          others={rows.filter((r) => r.id !== deleting.id && r.is_active)}
          busy={deleteBusy}
          error={deleteError}
          onConfirm={(moveTo) => void confirmDelete(moveTo)}
          onClose={() => !deleteBusy && setDeleting(null)}
        />
      )}
    </div>
  );
}
