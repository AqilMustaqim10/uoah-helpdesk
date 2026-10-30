// The "Export PDF report" window: choose the business unit and the period, see exactly what the report will say,
// then download. IT can only export their own unit (the unit box is fixed). The server checks everything again.
import { useState, type FormEvent } from "react";
import { Download } from "lucide-react";
import { ApiError } from "../../api/client";
import { exportPdf } from "../../api/export";
import { useToast } from "../../hooks/useToast";
import { cn } from "../../lib/cn";
import { saveBlob } from "../../lib/download";
import {
  MONTH_NAMES,
  isValidYmd,
  periodSummary,
  todayYmd,
  weekInfo,
  type ExportPeriod,
} from "../../lib/reportPeriod";
import { PRIORITY_META, STATUS_META } from "../../lib/ticketMeta";
import type { TicketQuery, UnitOption, User } from "../../types";
import Button from "../ui/Button";
import FormError from "../ui/FormError";
import Input from "../ui/Input";
import Modal from "../ui/Modal";
import Select from "../ui/Select";
import ReportLogoPreview from "./ReportLogoPreview";

interface Props {
  user: User;
  /** The filters currently set on the ticket list. */
  filters: TicketQuery;
  /** The business units (only ADMIN needs them). */
  units: UnitOption[];
  onClose: () => void;
}

const PERIOD_OPTIONS: Array<{ key: ExportPeriod; label: string }> = [
  { key: "all", label: "All dates" },
  { key: "day", label: "Daily" },
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
  { key: "year", label: "Yearly" },
];

/** The list filters in words, for example ["Status: Open", 'Search: "printer"']. */
function listFilterLines(f: TicketQuery): string[] {
  const out: string[] = [];
  if (f.status) out.push(`Status: ${STATUS_META[f.status].label}`);
  if (f.priority) out.push(`Priority: ${PRIORITY_META[f.priority].label}`);
  if (f.assignee === "unassigned") out.push("Unassigned");
  if (f.assignee === "me") out.push("Assigned to me");
  if (f.q.trim()) out.push(`Search: "${f.q.trim()}"`);
  return out;
}

export default function ExportPdfModal({
  user,
  filters,
  units,
  onClose,
}: Props) {
  const toast = useToast();
  const isAdmin = user.role === "ADMIN";
  const now = new Date();
  const thisYear = now.getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i); // this year and the five before

  // ADMIN starts with the unit chosen on the ticket list (if any)
  const [bu, setBu] = useState(isAdmin ? filters.unit : "");
  const [period, setPeriod] = useState<ExportPeriod>("all");
  const [date, setDate] = useState(todayYmd());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(thisYear);
  const [applyList, setApplyList] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const listLines = listFilterLines(filters);

  const unitLabel = isAdmin
    ? bu === ""
      ? "All business units"
      : (() => {
          const u = units.find((x) => String(x.id) === bu);
          return u ? `${u.name} (${u.code})` : "the chosen unit";
        })()
    : `${user.branding?.name ?? "Your business unit"}${user.branding?.code ? ` (${user.branding.code})` : ""}`;

  const week = period === "week" ? weekInfo(date) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    if ((period === "day" || period === "week") && !isValidYmd(date)) {
      setError("Please choose a valid date.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const { blob, filename } = await exportPdf(filters, {
        bu: isAdmin
          ? bu || "all"
          : user.business_unit_id
            ? String(user.business_unit_id)
            : "all",
        period,
        date,
        month,
        year,
        applyListFilters: applyList,
      });
      saveBlob(blob, filename);
      toast.success("PDF downloaded");
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not export. Please try again.",
      );
      setBusy(false);
    }
  }

  return (
    <Modal label="Export PDF report" onClose={onClose} size="lg">
      <form
        onSubmit={(e) => void submit(e)}
        className="space-y-5 p-6"
        noValidate
      >
        <div className="pr-10">
          <h2 className="text-lg font-semibold text-slate-900">
            Export PDF report
          </h2>
          <p className="text-sm text-slate-500">
            Choose which tickets the report should contain.
          </p>
        </div>

        {/* Business unit */}
        {isAdmin ? (
          <Select
            label="Business unit"
            value={bu}
            onChange={(e) => setBu(e.target.value)}
          >
            <option value="">All business units</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.code})
              </option>
            ))}
          </Select>
        ) : (
          <Select
            label="Business unit"
            value="own"
            disabled
            onChange={() => undefined}
          >
            <option value="own">{unitLabel}</option>
          </Select>
        )}

        {/* Period */}
        {/* The logo the PDF will show for this business unit (IT: always their own unit) */}
        <ReportLogoPreview bu={isAdmin ? bu || "all" : "all"} />
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">
            Period{" "}
            <span className="font-normal text-slate-400">
              (by the day each ticket was created)
            </span>
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {PERIOD_OPTIONS.map((p) => (
              <label
                key={p.key}
                className={cn(
                  "inline-flex h-9 cursor-pointer items-center rounded-lg px-3 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-brand/40",
                  period === p.key
                    ? "bg-brand text-onbrand shadow-sm"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                <input
                  type="radio"
                  name="export-period"
                  value={p.key}
                  checked={period === p.key}
                  onChange={() => setPeriod(p.key)}
                  className="sr-only"
                />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>

        {/* The value for the chosen period */}
        {(period === "day" || period === "week") && (
          <div className="animate-fade-in">
            <Input
              label={period === "day" ? "Day" : "Any day in the week"}
              type="date"
              value={date}
              min="2000-01-01"
              max={todayYmd()}
              onChange={(e) => setDate(e.target.value)}
              hint={
                period === "week"
                  ? week
                    ? week.text
                    : "Choose a day."
                  : undefined
              }
            />
          </div>
        )}
        {period === "month" && (
          <div className="grid animate-fade-in gap-4 sm:grid-cols-2">
            <Select
              label="Month"
              value={String(month)}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </Select>
            <Select
              label="Year"
              value={String(year)}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
        )}
        {period === "year" && (
          <div className="animate-fade-in">
            <Select
              label="Year"
              value={String(year)}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* The filters of the ticket list */}
        {listLines.length > 0 && (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={applyList}
              onChange={(e) => setApplyList(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span>
              Also apply my current list filters
              <span className="block text-xs text-slate-500">
                {listLines.join("  |  ")}
              </span>
            </span>
          </label>
        )}

        {/* What the PDF header will say */}
        <div className="rounded-xl bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            The report will say
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            Report for: {unitLabel} - {periodSummary(period, date, month, year)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            The performance summary counts tickets resolved or closed during
            this period, by assigned IT agent.
          </p>
        </div>

        <FormError message={error} />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={busy}
            icon={<Download className="h-4 w-4" />}
          >
            Download PDF
          </Button>
        </div>
      </form>
    </Modal>
  );
}
