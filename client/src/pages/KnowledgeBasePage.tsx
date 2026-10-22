// The Knowledge Base tab: search, filter, article cards, and "New article" for IT/ADMIN.
// Clicking a card opens the article window.
import { useEffect, useRef, useState } from "react";
import { BookOpen, Plus, SearchX } from "lucide-react";
import { authApi } from "../api/auth";
import { ApiError } from "../api/client";
import { kbApi } from "../api/kb";
import type {
  ArticleListResponse,
  ArticleQuery,
  UnitOption,
  User,
} from "../types";
import ArticleFilters from "../components/kb/ArticleFilters";
import ArticleList from "../components/kb/ArticleList";
import ArticleModal from "../components/kb/ArticleModal";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import ErrorBoundary from "../components/ui/ErrorBoundary";
import FormError from "../components/ui/FormError";
import Pagination from "../components/ui/Pagination";
import Skeleton from "../components/ui/Skeleton";
import { cn } from "../lib/cn";

const EMPTY_QUERY: ArticleQuery = { q: "", status: "", unit: "", page: 1 };

export default function KnowledgeBasePage({ user }: { user: User }) {
  const staff = user.role !== "USER";
  const isAdmin = user.role === "ADMIN";

  const [query, setQuery] = useState<ArticleQuery>(EMPTY_QUERY);
  const [data, setData] = useState<ArticleListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [version, setVersion] = useState(0);
  const [filterKey, setFilterKey] = useState(0); // changing it resets the search box
  const [open, setOpen] = useState<{ id: number | null } | null>(null); // id null = a new article
  const requestId = useRef(0);

  // ADMIN's unit filter needs the list of units
  useEffect(() => {
    if (!isAdmin) return;
    authApi
      .units()
      .then((r) => setUnits(r.units))
      .catch(() => undefined);
  }, [isAdmin]);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    kbApi
      .list(query)
      .then((r) => {
        if (id === requestId.current) setData(r);
      })
      .catch((err) => {
        if (id === requestId.current)
          setError(
            err instanceof ApiError ? err.message : "Could not load articles.",
          );
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [query, version]);

  // If the current page no longer exists, go back to page 1
  useEffect(() => {
    if (
      data &&
      data.articles.length === 0 &&
      data.total > 0 &&
      query.page > 1
    ) {
      setQuery((q) => ({ ...q, page: 1 }));
    }
  }, [data, query.page]);

  function change(patch: Partial<ArticleQuery>) {
    setQuery((q) => ({ ...q, ...patch, page: patch.page ?? 1 }));
  }

  function clearFilters() {
    setQuery(EMPTY_QUERY);
    setFilterKey((k) => k + 1);
  }

  const filtersActive = !!(query.q || query.status || query.unit);
  const firstLoad = loading && !data;

  return (
    <div className="space-y-4">
      <ArticleFilters
        key={filterKey}
        query={query}
        staff={staff}
        isAdmin={isAdmin}
        units={units}
        onChange={change}
      />

      <FormError message={error} />

      {firstLoad ? (
        <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : data && data.articles.length > 0 ? (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {data.total} article{data.total === 1 ? "" : "s"}
            </p>
            {staff && (
              <Button
                size="sm"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setOpen({ id: null })}
              >
                New article
              </Button>
            )}
          </div>
          <div className={cn("transition-opacity", loading && "opacity-60")}>
            <ArticleList
              articles={data.articles}
              showStatus={staff}
              onOpen={(id) => setOpen({ id })}
            />
          </div>
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
            title="No articles match your search"
            description="Try different words or clear the filters."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={BookOpen}
            title="No articles yet"
            description={
              staff
                ? "Write the first guide for your colleagues."
                : "Guides and answers will appear here."
            }
            action={
              staff ? (
                <Button onClick={() => setOpen({ id: null })}>
                  New article
                </Button>
              ) : undefined
            }
          />
        )
      ) : null}

      {open && (
        <ErrorBoundary onClose={() => setOpen(null)}>
          <ArticleModal
            key={open.id ?? "new"}
            user={user}
            articleId={open.id}
            onClose={() => setOpen(null)}
            onChanged={() => setVersion((v) => v + 1)}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
