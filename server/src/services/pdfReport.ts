// Builds the ticket report as a PDF (A4, landscape). Used by routes/export.ts.
// It knows nothing about the database: it receives plain rows, so it can be tested on its own (scripts/pdftest.ts).
// Fonts: the built-in PDF font (English and Malay). If the file server/fonts/report.ttf exists, it is used instead,
// which makes other languages (for example Chinese) print correctly.
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

type Doc = PDFKit.PDFDocument;

export const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};
export const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export interface ReportRow {
  id: number;
  title: string;
  status: string;
  priority: string;
  unit_code: string;
  requester_name: string;
  assignee_name: string | null;
  created_at: Date | string;
  due_at: Date | string | null;
  is_overdue: boolean;
}

export interface ReportInput {
  generatedBy: string;
  generatedAt: Date;
  timeZone: string; // for example Asia/Kuala_Lumpur
  scope: string; // "All business units" or the unit's name
  filters: string[]; // readable filters, for example ["Status: Open"]
  total: number; // how many tickets match (can be more than rows.length)
  rows: ReportRow[];
}

// ---------------- layout ----------------
const MARGIN = 36;
const ROW_H = 15;
const FONT_SIZE = 7.5;
const FONT_FILE = path.resolve(process.cwd(), "fonts", "report.ttf");

const INK = "#0f172a";
const MUTED = "#64748b";
const HEAD_BG = "#e2e8f0";
const STRIPE = "#f8fafc";
const RED = "#be123c";

// Column widths add up to 762 points (the printable width of A4 landscape is 770)
const COLUMNS = [
  { label: "Ticket", w: 44 },
  { label: "Title", w: 182 },
  { label: "Status", w: 58 },
  { label: "Priority", w: 50 },
  { label: "Unit", w: 42 },
  { label: "Requester", w: 108 },
  { label: "Assignee", w: 104 },
  { label: "Created", w: 82 },
  { label: "Due (! = overdue)", w: 92 },
];
const TABLE_W = COLUMNS.reduce((sum, c) => sum + c.w, 0);

// ---------------- text helpers ----------------

// Characters the built-in font can show (Windows-1252 beyond plain ASCII)
const WIN_ANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

/** For the built-in font: line breaks become spaces, and anything it cannot show becomes "?". */
function latin(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c === 9 || c === 10 || c === 13) out += " ";
    else if (c < 32 || c === 127) continue;
    else if (c <= 126 || (c >= 160 && c <= 255) || WIN_ANSI_EXTRA.has(c))
      out += ch;
    else out += "?";
  }
  return out;
}

/** For a custom font: only remove control characters. */
function plain(s: string): string {
  return s.replace(/[\u0000-\u001F\u007F]+/g, " ");
}

/** Cuts a text so it fits the given width, ending with "..." when it was shortened (binary search, so it is fast). */
function fit(doc: Doc, text: string, maxW: number): string {
  if (doc.widthOfString(text) <= maxW) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (doc.widthOfString(`${text.slice(0, mid)}...`) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}...`;
}

// ---------------- the report ----------------

function drawHeaderRow(doc: Doc, y: number, boldFont: string): number {
  doc.rect(MARGIN, y, TABLE_W, ROW_H + 2).fill(HEAD_BG);
  doc.font(boldFont).fontSize(FONT_SIZE).fillColor(INK);
  let x = MARGIN;
  for (const col of COLUMNS) {
    doc.text(col.label, x + 4, y + 5, { lineBreak: false });
    x += col.w;
  }
  return y + ROW_H + 2;
}

function draw(doc: Doc, input: ReportInput): void {
  // Choose the font: your own report.ttf when present, otherwise the built-in one
  let custom = fs.existsSync(FONT_FILE);
  let regular = "Helvetica";
  let bold = "Helvetica-Bold";
  if (custom) {
    try {
      doc.registerFont("ReportFont", FONT_FILE);
      doc.font("ReportFont");
      regular = "ReportFont";
      bold = "ReportFont";
    } catch {
      custom = false; // an unreadable font file: fall back to the built-in font
    }
  }
  const clean = custom ? plain : latin;

  const fmt = (d: Date | string | null): string => {
    if (!d) return "-";
    return new Date(d)
      .toLocaleString("en-GB", {
        timeZone: input.timeZone,
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
      .replace(",", "");
  };

  const bottom = doc.page.height - 48; // rows stop here; the page number sits below
  const textWidth = doc.page.width - MARGIN * 2;

  // ---- title block (first page only) ----
  doc
    .font(bold)
    .fontSize(16)
    .fillColor(INK)
    .text("Ticket report", MARGIN, MARGIN, { lineBreak: false });

  const countLine =
    input.total > input.rows.length
      ? `Tickets: ${input.total} (showing the newest ${input.rows.length})`
      : `Tickets: ${input.total}`;
  const info = [
    `Generated ${fmt(input.generatedAt)} by ${clean(input.generatedBy)}`,
    `Scope: ${clean(input.scope)}`,
    `Filters: ${input.filters.length > 0 ? clean(input.filters.join("  |  ")) : "none"}`,
    countLine,
  ];
  doc.font(regular).fontSize(8.5).fillColor(MUTED);
  let y = MARGIN + 24;
  for (const line of info) {
    doc.text(fit(doc, line, textWidth), MARGIN, y, { lineBreak: false });
    y += 12;
  }
  y += 6;

  // ---- the table ----
  if (input.rows.length === 0) {
    doc
      .font(regular)
      .fontSize(10)
      .fillColor(MUTED)
      .text("No tickets match these filters.", MARGIN, y, { lineBreak: false });
  } else {
    y = drawHeaderRow(doc, y, bold);

    input.rows.forEach((r, i) => {
      // A new page when the row would not fit; the table header repeats on every page
      if (y + ROW_H > bottom) {
        doc.addPage();
        y = drawHeaderRow(doc, MARGIN, bold);
      }
      if (i % 2 === 1) doc.rect(MARGIN, y, TABLE_W, ROW_H).fill(STRIPE);

      const cells: Array<{ text: string; color?: string }> = [
        { text: `HD-${r.id}` },
        { text: clean(r.title) },
        { text: STATUS_LABEL[r.status] ?? r.status },
        {
          text: PRIORITY_LABEL[r.priority] ?? r.priority,
          color: r.priority === "URGENT" ? RED : undefined,
        },
        { text: clean(r.unit_code) },
        { text: clean(r.requester_name) },
        { text: clean(r.assignee_name ?? "-") },
        { text: fmt(r.created_at) },
        {
          text: `${fmt(r.due_at)}${r.is_overdue ? " !" : ""}`,
          color: r.is_overdue ? RED : undefined,
        },
      ];

      doc.font(regular).fontSize(FONT_SIZE);
      let x = MARGIN;
      cells.forEach((cell, k) => {
        doc
          .fillColor(cell.color ?? INK)
          .text(fit(doc, cell.text, COLUMNS[k].w - 8), x + 4, y + 4, {
            lineBreak: false,
          });
        x += COLUMNS[k].w;
      });
      y += ROW_H;
    });
  }

  // ---- page numbers (all pages are kept in memory until now, so the total is known) ----
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0; // lets us write inside the bottom margin without starting a new page
    doc.font(regular).fontSize(7.5).fillColor(MUTED);
    doc.text("UOA IT Helpdesk", MARGIN, doc.page.height - 24, {
      lineBreak: false,
    });
    const label = `Page ${i + 1} of ${range.count}`;
    doc.text(
      label,
      doc.page.width - MARGIN - doc.widthOfString(label),
      doc.page.height - 24,
      { lineBreak: false },
    );
  }
}

/** The whole PDF as bytes. Any problem rejects the promise (so the route can answer with a normal error). */
export function buildTicketReportPdf(input: ReportInput): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: MARGIN,
      bufferPages: true,
      info: {
        Title: "Ticket report",
        Author: "UOA IT Helpdesk",
        Creator: "UOA IT Helpdesk",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      draw(doc, input);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
