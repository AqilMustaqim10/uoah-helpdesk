// One window for reading, creating and editing an article.
//  - articleId = null  -> starts with the empty "New article" form
//  - otherwise         -> loads the article; people who may edit see an Edit button
import { useEffect, useState } from "react";
import { AlertCircle, Globe2, Pencil } from "lucide-react";
import { ApiError } from "../../api/client";
import { kbApi } from "../../api/kb";
import { useToast } from "../../hooks/useToast";
import { formatDateTime } from "../../lib/format";
import type { ArticleDetailResponse, User } from "../../types";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import Skeleton from "../ui/Skeleton";
import ArticleAttachments from "./ArticleAttachments";
import ArticleForm from "./ArticleForm";
import ArticleStatusBadge from "./ArticleStatusBadge";

interface Props {
  user: User;
  articleId: number | null;
  onClose: () => void;
  /** Called after any change so the list behind the window refreshes. */
  onChanged: () => void;
}

export default function ArticleModal({
  user,
  articleId,
  onClose,
  onChanged,
}: Props) {
  const toast = useToast();
  const [id, setId] = useState<number | null>(articleId);
  const [data, setData] = useState<ArticleDetailResponse | null>(null);
  const [editing, setEditing] = useState(articleId === null);
  const [error, setError] = useState("");

  // Load the article. A missing article and one you may not see look the same: "not found".
  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    kbApi
      .get(id)
      .then((r) => !cancelled && setData({ ...r, files: r.files ?? [] }))
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? "This article was not found."
            : err instanceof ApiError
              ? err.message
              : "Could not load the article.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function apply(result: ArticleDetailResponse, message: string) {
    setData({ ...result, files: result.files ?? [] });
    onChanged();
    toast.success(message);
  }

  const label = data
    ? `Article ${data.article.title}`
    : editing
      ? "New article"
      : "Article";

  return (
    <Modal label={label} onClose={onClose} size="xl">
      {editing ? (
        <ArticleForm
          user={user}
          initial={data?.article ?? null}
          onCancel={() => (id === null ? onClose() : setEditing(false))}
          onSaved={(result, created) => {
            setId(result.article.id);
            apply(
              result,
              created
                ? "Article created. You can attach files now."
                : "Article saved",
            );
            setEditing(false);
          }}
        />
      ) : error ? (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <AlertCircle className="mb-3 h-8 w-8 text-slate-400" aria-hidden />
          <p className="text-sm font-medium text-slate-900">{error}</p>
        </div>
      ) : !data ? (
        <div
          className="space-y-4 p-6"
          aria-busy="true"
          aria-label="Loading article"
        >
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <div>
          <header className="border-b border-slate-200 px-6 py-5 pr-14">
            <div className="flex flex-wrap items-center gap-2">
              {user.role !== "USER" && (
                <ArticleStatusBadge status={data.article.status} />
              )}
              {data.article.unit_code ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                  {data.article.unit_code}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  <Globe2 className="h-3 w-3" aria-hidden /> All units
                </span>
              )}
            </div>
            <h2 className="mt-2 break-words text-lg font-semibold text-slate-900">
              {data.article.title}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              By {data.article.author_name}. Last updated by{" "}
              {data.article.editor_name} on{" "}
              {formatDateTime(data.article.updated_at)}.
            </p>
            {data.article.can_edit && (
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Pencil className="h-4 w-4" />}
                  onClick={() => setEditing(true)}
                >
                  Edit
                </Button>
              </div>
            )}
          </header>

          <div className="space-y-6 p-6">
            {/* Plain text: React escapes it, so nobody can inject HTML */}
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
              {data.article.body}
            </p>

            {data.article.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {data.article.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            <ArticleAttachments
              articleId={data.article.id}
              files={data.files}
              canEdit={data.article.can_edit}
              onUpdated={apply}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
