// Makes a sample PDF so you can look at the layout without any tickets. Run:  npx tsx src/scripts/pdftest.ts
// It does not touch the database. It prints where the file was saved (in your temporary folder).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildTicketReportPdf, type ReportRow } from "../services/pdfReport";

const statuses = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const titles = [
  "Printer on level 3 is offline",
  "=1+1 (looks like a formula, but it is just text)",
  "A very long title that goes on and on and on, so that it has to be cut short to fit inside its column of the table",
  "Wi-Fi in the ballroom is very slow during events",
  "Special characters: caf\u00e9, \u201cquotes\u201d, \u2013 dash, \u4e2d\u6587 (Chinese shows as ? without report.ttf)",
];

const rows: ReportRow[] = Array.from({ length: 130 }, (_, i) => ({
  id: 130 - i,
  title: titles[i % titles.length],
  status: statuses[i % 4],
  priority: priorities[i % 4],
  unit_code: ["CCEC", "FNB", "HOTEL", "KLBS", "KLW", "HQ"][i % 6],
  requester_name:
    i % 7 === 0 ? "Muhammad Aqil bin Mustaqim Abdullah" : "Siti Aminah",
  assignee_name: i % 3 === 0 ? null : "Aqil Mustaqim",
  created_at: new Date(Date.now() - i * 3_600_000),
  due_at: i % 5 === 0 ? new Date(Date.now() + 86_400_000) : null,
  is_overdue: i % 6 === 0,
}));

buildTicketReportPdf({
  generatedBy: "Test User (ADMIN)",
  generatedAt: new Date(),
  timeZone: "Asia/Kuala_Lumpur",
  scope: "All business units",
  subtitle: "Report for: Convention Centre & Events Corp (CCEC) - October 2026",
  periodLine: "Tickets created 1 Oct 2026 to 31 Oct 2026",
  filters: ["Status: Open", 'Search: "printer"'],
  total: 130,
  rows,
})
  .then((pdf) => {
    const file = path.join(os.tmpdir(), "helpdesk-sample-report.pdf");
    fs.writeFileSync(file, pdf);
    console.log(
      `Sample report saved (${Math.round(pdf.length / 1024)} KB):\n${file}`,
    );
  })
  .catch((err) => {
    console.error("FAILED:", err.message);
    process.exitCode = 1;
  });
