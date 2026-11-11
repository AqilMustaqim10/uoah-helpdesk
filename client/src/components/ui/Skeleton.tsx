import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/cn";

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
}

export default function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "skeleton-shimmer rounded-lg motion-reduce:animate-none",
        className,
      )}
      style={style}
    />
  );
}

export function CardSkeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-2xl border border-border bg-surface p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="mt-3 h-8 w-1/2 rounded-md" />
      <Skeleton className="mt-2 h-3 w-2/3" />
    </div>
  );
}

export function TicketRowSkeleton({
  className,
  showCheckbox = false,
}: SkeletonProps & { showCheckbox?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex min-h-[4.25rem] items-center gap-3 px-4 py-3",
        className,
      )}
    >
      {showCheckbox && <Skeleton className="h-4 w-4 shrink-0 rounded" />}
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <div className="hidden items-center gap-2 sm:flex">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

export function TicketListSkeleton({
  count = 5,
  showCheckbox = false,
}: {
  count?: number;
  showCheckbox?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div
        aria-hidden="true"
        className="hidden h-10 items-center gap-4 border-b border-slate-200 bg-slate-50 px-4 sm:flex"
      >
        {showCheckbox && <Skeleton className="h-4 w-4 rounded" />}
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="divide-y divide-slate-200">
        {Array.from({ length: count }, (_, index) => (
          <TicketRowSkeleton key={index} showCheckbox={showCheckbox} />
        ))}
      </div>
    </div>
  );
}

export function DrawerSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex h-full flex-col overflow-hidden"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-6 py-4 pr-14">
        <Skeleton className="h-7 w-20 rounded-md" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-hidden bg-slate-50 px-6 py-5">
        <div className="space-y-3">
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-6 w-3/4" />
        </div>
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-100/60 p-4 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-8 w-full rounded-lg" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-8 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <Skeleton className="h-4 w-1/4" />
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="h-16 shrink-0 border-t border-slate-200 bg-white" />
    </div>
  );
}

export function ChartSkeleton({
  variant = "line",
  className,
}: SkeletonProps & { variant?: "line" | "bars" }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="w-1/3 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      {variant === "line" ? (
        <div className="relative mt-5 h-48 overflow-hidden rounded-lg">
          <div className="absolute inset-0 flex flex-col justify-between py-3">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-px w-full rounded-none" />
            ))}
          </div>
          <svg
            viewBox="0 0 640 180"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            <path
              d="M0 142 C70 118 96 136 160 92 S260 110 320 66 S420 95 480 48 S570 72 640 24"
              fill="none"
              stroke="var(--color-slate-300)"
              strokeWidth="5"
              strokeLinecap="round"
              className="skeleton-chart-line"
            />
          </svg>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-1/4" />
                <Skeleton className="h-3 w-8" />
              </div>
              <Skeleton
                className="h-2 rounded-full"
                style={{ width: `${82 - index * 13}%` }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div aria-hidden="true" className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        <Skeleton className="h-4 w-36 self-center" />
        <Skeleton className="h-9 w-36 rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <CardSkeleton key={index} />
        ))}
      </div>
      <ChartSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartSkeleton variant="bars" />
        <ChartSkeleton variant="bars" />
      </div>
    </div>
  );
}

export function LoadingTransition({
  loading,
  label,
  fallback,
  children,
}: {
  loading: boolean;
  label: string;
  fallback: ReactNode;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const content = loading ? fallback : children;

  return (
    <div
      role={loading ? "status" : undefined}
      aria-busy={loading}
      aria-label={loading ? label : undefined}
    >
      <AnimatePresence initial={false} mode="wait">
        <m.div
          key={loading ? "loading" : "loaded"}
          initial={reduceMotion ? false : { opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -2 }}
          transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
        >
          {content}
        </m.div>
      </AnimatePresence>
    </div>
  );
}
