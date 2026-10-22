// The article editor form (used for both "New article" and "Edit").
//  - ADMIN chooses the unit (or "All units" = global)
//  - IT always writes for their own unit, so there is no unit field
// The server repeats every check and decides who may write where.
import { useEffect, useState, type FormEvent } from "react";
import { authApi } from "../../api/auth";
import { ApiError } from "../../api/client";
import { kbApi } from "../../api/kb";
import { ARTICLE_STATUS_LIST, ARTICLE_STATUS_META } from "../../lib/kbMeta";
import type {
  ArticleDetail,
  ArticleDetailResponse,
  ArticleInput,
  ArticleStatus,
  UnitOption,
  User,
} from "../../types";
import Button from "../ui/Button";
import FormError from "../ui/FormError";
import Input from "../ui/Input";
import Select from "../ui/Select";
import Textarea from "../ui/Textarea";

interface Props {
  user: User;
  /** The article being edited, or null for a new one. */
  initial: ArticleDetail | null;
  onSaved: (result: ArticleDetailResponse, created: boolean) => void;
  onCancel: () => void;
}

export default function ArticleForm({
  user,
  initial,
  onSaved,
  onCancel,
}: Props) {
  const isAdmin = user.role === "ADMIN";
  const noUnit = user.role === "IT" && user.business_unit_id === null;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [tags, setTags] = useState(initial ? initial.tags.join(", ") : "");
  const [status, setStatus] = useState<ArticleStatus>(
    initial?.status ?? "DRAFT",
  );
  const [unitId, setUnitId] = useState(
    initial?.business_unit_id ? String(initial.business_unit_id) : "",
  ); // '' = global
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [errors, setErrors] = useState<{ title?: string; body?: string }>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  // Only ADMIN needs the list of units
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    authApi
      .units()
      .then((r) => !cancelled && setUnits(r.units))
      .catch(
        () => !cancelled && setFormError("Could not load the business units."),
      );
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    const errs: typeof errors = {};
    if (title.trim().length < 3)
      errs.title = "Please enter a title (at least 3 characters).";
    if (!body.trim()) errs.body = "Please write the article text.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload: ArticleInput = {
      title: title.trim(),
      body: body.trim(),
      status,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      ...(isAdmin
        ? { business_unit_id: unitId === "" ? null : Number(unitId) }
        : {}),
    };

    setBusy(true);
    setFormError("");
    try {
      const result = initial
        ? await kbApi.update(initial.id, payload)
        : await kbApi.create(payload);
      onSaved(result, !initial);
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
    <form onSubmit={submit} className="space-y-4 p-6" noValidate>
      <div className="pr-10">
        <h2 className="text-lg font-semibold text-slate-900">
          {initial ? "Edit article" : "New article"}
        </h2>
        <p className="text-sm text-slate-500">
          Plain text. You can attach pictures and PDFs after saving.
        </p>
      </div>

      <FormError
        message={
          noUnit
            ? "Your account has no business unit. Please ask an administrator to set one."
            : formError
        }
      />

      <Input
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={errors.title}
        maxLength={200}
        placeholder="e.g. How to connect to the guest Wi-Fi"
        autoFocus
      />
      <Textarea
        label="Article text"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        error={errors.body}
        maxLength={50000}
        rows={12}
        placeholder="Write the steps or the answer here."
      />
      <Input
        label="Tags"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        hint="Separate tags with commas, for example: printer, wifi. Up to 10 tags."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as ArticleStatus)}
        >
          {ARTICLE_STATUS_LIST.map((s) => (
            <option key={s} value={s}>
              {ARTICLE_STATUS_META[s].label}
            </option>
          ))}
        </Select>
        {isAdmin && (
          <Select
            label="Visible to"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
          >
            <option value="">All units (global)</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.code})
              </option>
            ))}
          </Select>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" loading={busy} disabled={noUnit}>
          {initial ? "Save changes" : "Create article"}
        </Button>
      </div>
    </form>
  );
}
