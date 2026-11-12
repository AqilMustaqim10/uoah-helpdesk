// The "Export PDF report" window: choose the business unit, IT staff and period, see exactly what the report will say,
// then download. IT can only export their own unit (the unit box is fixed). The server checks everything again.
import { useEffect, useState, type FormEvent } from "react";
import { Download } from "lucide-react";
import { ApiError } from "../../api/client";
import {
  exportPdf,
  fetchExportItStaff,
  type ExportItStaff,
} from "../../api/export";
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
  const [itStaffId, setItStaffId] = useState("");
  const [itStaff, setItStaff] = useState<ExportItStaff[]>([]);
  const [staffLoading, setStaffLoading] = useState(isAdmin);
  const [staffError, setStaffError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const listLines = listFilterLines(filters);
  const selectedItStaff = itStaff.find(
    (staff) => String(staff.id) === itStaffId,
  );
  const detectedBu = selectedItStaff?.business_unit_id;
  const exportBu =
    detectedBu != null ? String(detectedBu) : bu;

  useEffect(() => {
    if (!isAdmin) return;
    fetchExportItStaff()
      .then((response) => setItStaff(response.staff))
      .catch((err) =>
        setStaffError(
          err instanceof ApiError
            ? err.message
            : "Could not load IT staff.",
        ),
      )
      .finally(() => setStaffLoading(false));
  }, [isAdmin]);

  const unitLabel = isAdmin
    ? exportBu === ""
      ? "All business units"
      : (() => {
          const staffUnit =
            detectedBu != null ? selectedItStaff : undefined;
          if (staffUnit?.unit_name) {
            return `${staffUnit.unit_name}${staffUnit.unit_code ? ` (${staffUnit.unit_code})` : ""}`;
          }
          const u = units.find((x) => String(x.id) === exportBu);
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
          ? exportBu || "all"
          : user.business_unit_id
            ? String(user.business_unit_id)
            : "all",
        itStaffId: isAdmin ? itStaffId : "",
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
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Export PDF report
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Choose which tickets the report should contain.
          </p>
        </div>

        {/* Business unit */}
        {isAdmin ? (
          <Select
            label={selectedItStaff ? "Business unit (detected from IT staff)" : "Business unit"}
            value={exportBu}
            disabled={!!selectedItStaff}
            onChange={(e) => setBu(e.target.value)}
          >
            {!selectedItStaff && <option value="">All business units</option>}
            {selectedItStaff ? (
              <option value={exportBu}>
                {selectedItStaff.unit_name ?? "Business unit"}
                {selectedItStaff.unit_code
                  ? ` (${selectedItStaff.unit_code})`
                  : ""}
              </option>
            ) : null}
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

        {isAdmin && (
          <Select
            label="IT staff"
            value={itStaffId}
            disabled={staffLoading || !!staffError}
            onChange={(e) => setItStaffId(e.target.value)}
          >
            <option value="">
              {staffLoading
                ? "Loading IT staff..."
                : staffError
                  ? "IT staff unavailable"
                  : "All IT staff"}
            </option>
            {itStaff.map((staff) => (
              <option
                key={staff.id}
                value={staff.id}
                disabled={staff.business_unit_id === null}
              >
                {staff.name}
                {staff.unit_code ? ` (${staff.unit_code})` : ""}
                {!staff.is_active ? " (inactive)" : ""}
                {staff.business_unit_id === null ? " (no business unit)" : ""}
              </option>
            ))}
          </Select>
        )}

        {/* Period */}
        {/* The logo the PDF will show for this business unit (IT: always their own unit) */}
        <ReportLogoPreview bu={isAdmin ? exportBu || "all" : "all"} />
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
            Period{" "}
            <span className="font-normal text-slate-400 dark:text-slate-500">
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
                    : "border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-950",
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
          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={applyList}
              onChange={(e) => setApplyList(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-700"
            />
            <span>
              Also apply my current list filters
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                {listLines.join("  |  ")}
              </span>
            </span>
          </label>
        )}

        {/* What the PDF header will say */}
        <div className="rounded-xl bg-slate-50 dark:bg-slate-950 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            The report will say
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Report for: {unitLabel} - {periodSummary(period, date, month, year)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            The performance summary counts tickets resolved or closed during
            this period, by assigned IT agent.
          </p>
        </div>

        <FormError message={error || staffError} />

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
