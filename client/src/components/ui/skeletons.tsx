// Loading placeholders that copy the exact shape of the real thing, so nothing jumps when data arrives.
// Each one mirrors a real component: KpiCard, BentoCard panels, the ticket table, the ticket drawer
// and the app shell. They use <Skeleton>, so the shimmer works in light and dark mode.
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { CARD_SURFACE } from "./Bento";
import Skeleton from "./Skeleton";
import { ticketGridFor } from "../../lib/ticketGrid";

/** A card-shaped shell that fades/slides in with the rest of the page (GSAP picks up data-reveal). */
function SkeletonCard({
  className,
  innerClassName,
  children,
}: {
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={className} data-reveal="">
      <div className={cn("h-full p-4 sm:p-5", CARD_SURFACE, innerClassName)}>
        {children}
      </div>
    </div>
  );
}

/** Mirrors <KpiCard>: label + icon bubble on top, big counter, small hint. */
export function KpiCardSkeleton({
  className,
  large,
}: {
  className?: string;
  large?: boolean;
}) {
  return (
    <SkeletonCard className={className}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className={cn("mt-3", large ? "h-10 w-24" : "h-8 w-14")} />
      <Skeleton className="mt-2 h-3 w-28" />
    </SkeletonCard>
  );
}

/** Mirrors <BentoCard> panels that hold a title and a body (charts, bar lists). */
export function BentoCardSkeleton({
  className,
  bodyClassName = "h-40",
}: {
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <SkeletonCard className={className}>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-1.5 h-3 w-24" />
      <Skeleton className={cn("mt-5 w-full", bodyClassName)} />
    </SkeletonCard>
  );
}

/** Mirrors the bar-list cards ("Tickets by status"): a label/value row over a thin bar, four times. */
export function BarListSkeleton({ className }: { className?: string }) {
  return (
    <SkeletonCard className={className}>
      <Skeleton className="h-4 w-36" />
      <Skeleton className="mt-1.5 h-3 w-24" />
      <div className="mt-4 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <div className="mb-1.5 flex justify-between">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3.5 w-10" />
            </div>
            <Skeleton className="h-2 rounded-full" />
          </div>
        ))}
      </div>
    </SkeletonCard>
  );
}

/** The whole dashboard: filter bar, KPI counters, chart, SLA card and bar lists (same grid as the page). */
export function DashboardSkeleton({
  admin = false,
  children,
}: {
  admin?: boolean;
  /** The real filter bar, shown instead of the placeholder one. */
  children?: ReactNode;
}) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6"
      aria-busy="true"
      role="status"
      aria-label="Loading dashboard"
    >
      {children ?? (
        <SkeletonCard className="col-span-2 lg:col-span-6" innerClassName="!py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-32" />
          </div>
        </SkeletonCard>
      )}
      <KpiCardSkeleton className="col-span-2" large />
      {Array.from({ length: 4 }).map((_, i) => (
        <KpiCardSkeleton key={i} className="col-span-1" />
      ))}
      <BentoCardSkeleton
        className="col-span-2 lg:col-span-4"
        bodyClassName="h-44"
      />
      <KpiCardSkeleton className="col-span-2" large />
      <BarListSkeleton
        className={cn("col-span-2", admin ? "lg:col-span-2" : "lg:col-span-3")}
      />
      <BarListSkeleton
        className={cn("col-span-2", admin ? "lg:col-span-2" : "lg:col-span-3")}
      />
      {admin && <BarListSkeleton className="col-span-2 lg:col-span-2" />}
    </div>
  );
}

/** Mirrors one ticket row (small-screen stack and large-screen table cells). */
export function TicketRowSkeleton({ showUnit }: { showUnit: boolean }) {
  return (
    <div className="px-4 py-3">
      {/* small screens: stacked */}
      <div className="space-y-2 lg:hidden">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-12" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-3 w-1/3" />
      </div>
      {/* large screens: the same columns as the real table */}
      <div
        className={cn(
          "hidden items-center gap-4 lg:grid",
          ticketGridFor(showUnit),
        )}
      >
        <Skeleton className="h-3.5 w-14" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        {showUnit && <Skeleton className="h-3.5 w-10" />}
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-7 w-7 rounded-full" />
        <Skeleton className="h-3.5 w-16" />
      </div>
    </div>
  );
}

/** The ticket table: header cells plus a few rows. */
export function TicketTableSkeleton({
  rows = 6,
  showUnit = false,
}: {
  rows?: number;
  showUnit?: boolean;
}) {
  return (
    <div
      className={cn("overflow-hidden", CARD_SURFACE)}
      aria-busy="true"
      role="status"
      aria-label="Loading tickets"
    >
      <div
        className={cn(
          "hidden items-center gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950/40 lg:grid",
          ticketGridFor(showUnit),
        )}
        data-reveal=""
      >
        {Array.from({ length: showUnit ? 7 : 6 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-3/5" />
        ))}
      </div>
      <div className="divide-y divide-slate-200 dark:divide-slate-800">
        {Array.from({ length: rows }).map((_, i) => (
          <TicketRowSkeleton key={i} showUnit={showUnit} />
        ))}
      </div>
    </div>
  );
}

/** Inside the ticket drawer while the ticket loads: header chip, title, fact tiles, a long block. */
export function DrawerSkeleton() {
  return (
    <div
      className="space-y-4 p-6"
      aria-busy="true"
      role="status"
      aria-label="Loading ticket"
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-16" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <Skeleton className="h-44 w-full" />
    </div>
  );
}

/** Shown while we check whether you are signed in: the app shell, empty. */
export function AppBootSkeleton() {
  return (
    <div
      className="flex h-dvh overflow-hidden bg-slate-50 dark:bg-[#090d16]"
      aria-busy="true"
      role="status"
      aria-label="Loading"
    >
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:flex">
        <div className="flex h-20 items-center border-b border-slate-200 p-3 dark:border-slate-800">
          <Skeleton className="h-full w-full" />
        </div>
        <div className="space-y-2 p-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="ml-auto h-9 w-32" />
          <Skeleton className="h-9 w-9" />
        </div>
        <div className="mx-auto w-full max-w-6xl flex-1 overflow-hidden p-4 sm:p-6">
          <DashboardSkeleton />
        </div>
      </div>
    </div>
  );
}
