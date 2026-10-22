// A line chart: tickets created vs resolved for each of the last 30 days.
// Drawn with plain SVG (no chart library). Hover or touch a day to see its numbers.
// Colors come from the theme, so it follows the unit's brand color and dark mode.
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { TrendPoint } from "../../api/dashboard";

const HEIGHT = 240;
const PAD = { left: 40, right: 14, top: 14, bottom: 30 };

/** 2026-10-16 -> "16 Oct" */
function labelOf(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
  });
}

export default function TrendChart({ points }: { points: TrendPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  // The chart is drawn at the real width of its box, so text never gets squashed on a phone
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(280, Math.floor(el.clientWidth)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const totalCreated = points.reduce((sum, p) => sum + p.created, 0);
  const totalResolved = points.reduce((sum, p) => sum + p.resolved, 0);

  const model = useMemo(() => {
    const n = points.length;
    const innerW = width - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const highest = Math.max(
      0,
      ...points.map((p) => Math.max(p.created, p.resolved)),
    );
    const yMax = Math.max(4, Math.ceil(highest / 4) * 4); // a multiple of 4, so the 4 grid lines are whole numbers

    const x = (i: number) =>
      PAD.left + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
    const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;

    const line = (key: "created" | "resolved") =>
      points
        .map(
          (p, i) =>
            `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`,
        )
        .join(" ");
    const area = (key: "created" | "resolved") =>
      `${line(key)} L${x(n - 1).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;

    const ticks = [0, 1, 2, 3, 4].map((k) => (k * yMax) / 4);
    const every = width < 480 ? 7 : 5; // fewer date labels on a narrow screen
    const labelled = points
      .map((_, i) => i)
      .filter((i) => (n - 1 - i) % every === 0);

    return {
      n,
      innerW,
      x,
      y,
      ticks,
      labelled,
      createdLine: line("created"),
      resolvedLine: line("resolved"),
      createdArea: area("created"),
      resolvedArea: area("resolved"),
    };
  }, [points, width]);

  function onPointer(e: PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round(
      ((e.clientX - box.left - PAD.left) / model.innerW) * (model.n - 1),
    );
    setHover(Math.min(model.n - 1, Math.max(0, i)));
  }

  const empty = totalCreated === 0 && totalResolved === 0;
  const active = hover !== null ? points[hover] : null;

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      aria-label="Tickets created and resolved"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Created vs resolved
          </h3>
          <p className="text-xs text-slate-500">
            Tickets per day, last {points.length} days
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full bg-brand" aria-hidden />
            Created{" "}
            <span className="font-semibold tabular-nums text-slate-900">
              {totalCreated}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span
              className="h-2.5 w-2.5 rounded-full bg-emerald-500"
              aria-hidden
            />
            Resolved{" "}
            <span className="font-semibold tabular-nums text-slate-900">
              {totalResolved}
            </span>
          </span>
        </div>
      </div>

      <div ref={wrapRef} className="relative mt-4">
        {empty ? (
          <p className="flex h-40 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
            No tickets were created or resolved in the last {points.length}{" "}
            days.
          </p>
        ) : (
          <>
            <svg
              width={width}
              height={HEIGHT}
              role="img"
              aria-label={`Line chart of tickets created and resolved per day over the last ${points.length} days. ${totalCreated} created and ${totalResolved} resolved in total.`}
              className="block touch-pan-y"
              onPointerMove={onPointer}
              onPointerDown={onPointer}
              onPointerLeave={() => setHover(null)}
            >
              {/* grid lines and the numbers on the left */}
              {model.ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={model.y(t)}
                    y2={model.y(t)}
                    className="stroke-slate-200"
                    strokeWidth={1}
                  />
                  <text
                    x={PAD.left - 8}
                    y={model.y(t) + 4}
                    textAnchor="end"
                    fontSize={11}
                    className="fill-slate-400"
                  >
                    {t}
                  </text>
                </g>
              ))}

              {/* dates along the bottom */}
              {model.labelled.map((i) => (
                <text
                  key={points[i].day}
                  x={model.x(i)}
                  y={HEIGHT - 8}
                  textAnchor="middle"
                  fontSize={11}
                  className="fill-slate-400"
                >
                  {labelOf(points[i].day)}
                </text>
              ))}

              {/* soft areas, then the two lines */}
              <path d={model.resolvedArea} className="fill-emerald-500/10" />
              <path d={model.createdArea} className="fill-brand/10" />
              <path
                d={model.resolvedLine}
                fill="none"
                className="stroke-emerald-500"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d={model.createdLine}
                fill="none"
                className="stroke-brand"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* the hovered day */}
              {active && hover !== null && (
                <g>
                  <line
                    x1={model.x(hover)}
                    x2={model.x(hover)}
                    y1={PAD.top}
                    y2={HEIGHT - PAD.bottom}
                    className="stroke-slate-300"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={model.x(hover)}
                    cy={model.y(active.resolved)}
                    r={4}
                    className="fill-emerald-500"
                  />
                  <circle
                    cx={model.x(hover)}
                    cy={model.y(active.created)}
                    r={4}
                    className="fill-brand"
                  />
                </g>
              )}
            </svg>

            {active && hover !== null && (
              <div
                className="pointer-events-none absolute top-0 w-36 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
                style={{
                  left: Math.min(width - 72, Math.max(72, model.x(hover))),
                }}
              >
                <p className="font-medium text-slate-900">
                  {labelOf(active.day)}
                </p>
                <p className="mt-0.5 flex justify-between text-slate-600">
                  Created{" "}
                  <span className="font-semibold tabular-nums text-slate-900">
                    {active.created}
                  </span>
                </p>
                <p className="flex justify-between text-slate-600">
                  Resolved{" "}
                  <span className="font-semibold tabular-nums text-slate-900">
                    {active.resolved}
                  </span>
                </p>
              </div>
            )}

            {/* The same numbers as a table, for screen readers */}
            <table className="sr-only">
              <caption>Tickets created and resolved per day</caption>
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Created</th>
                  <th>Resolved</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.day}>
                    <td>{labelOf(p.day)}</td>
                    <td>{p.created}</td>
                    <td>{p.resolved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </section>
  );
}
