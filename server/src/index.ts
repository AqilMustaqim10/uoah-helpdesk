import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "node:path";
import { config } from "./config/env";
import { query } from "./db/pool";
import { purgeOldAuditLogs } from "./db/audit";
import { ah, HttpError } from "./lib/http";
import { requireAuth, requireRole } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import { originCheck } from "./middleware/originCheck";
import { apiLimiter } from "./middleware/rateLimit";
import {
  itClosedFileGuard,
  itClosedTicketGuard,
} from "./middleware/closedGuard";
import authRoutes from "./routes/auth";
import mfaRoutes from "./routes/mfa";
import ticketRoutes from "./routes/tickets";
import aiSuggestRoutes from "./routes/aiSuggest";
import commentRoutes from "./routes/comments";
import ticketFileRoutes from "./routes/ticketFiles";
import ticketDeleteRoutes from "./routes/ticketDelete";
import fileRoutes from "./routes/files";
import statsRoutes from "./routes/stats";
import exportRoutes from "./routes/export";
import userRoutes from "./routes/users";
import userMfaRoutes from "./routes/usersMfa";
import unitRoutes from "./routes/units";
import departmentRoutes from "./routes/departments";
import kbRoutes from "./routes/kb";
import kbSuggestRoutes from "./routes/kbSuggest";
import auditRoutes from "./routes/audit";
import historyRoutes from "./routes/history";
import kbSearchRoutes from "./routes/kbSearch";
import notificationRoutes from "./routes/notifications";

const app = express();
const AUDIT_LOG_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

app.disable("x-powered-by");

// Behind a reverse proxy (IIS, nginx, Cloudflare, etc.)
if (config.trustProxy) {
  app.set("trust proxy", 1);
}

// Force HTTPS in production / UAT when required
if (config.requireHttps) {
  app.use((req, res, next) => {
    if (req.secure || req.headers["x-forwarded-proto"] === "https") {
      return next();
    }
    // Only redirect GET/HEAD so we don't break API clients that POST over HTTP
    if (req.method === "GET" || req.method === "HEAD") {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    return res.status(403).json({ error: "HTTPS required" });
  });
}

// Basic + extra safety headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (config.isProd && config.requireHttps) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'",
  );
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, !origin || config.clientOrigins.includes(origin));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());

app.use("/api", apiLimiter, originCheck);

app.get(
  "/api/health",
  ah(async (_req, res) => {
    await query("SELECT 1");
    res.json({ ok: true });
  }),
);

app.use("/api/auth/2fa", mfaRoutes);
app.use("/api/auth", authRoutes);

app.use(
  "/api/tickets",
  requireAuth,
  itClosedTicketGuard,
  ticketRoutes,
  aiSuggestRoutes,
  commentRoutes,
  ticketFileRoutes,
  ticketDeleteRoutes,
);

app.use("/api/notifications", requireAuth, notificationRoutes);
app.use("/api/files", requireAuth, itClosedFileGuard, fileRoutes);

app.use("/api/stats", requireAuth, requireRole("ADMIN", "IT"), statsRoutes);
app.use("/api/export", requireAuth, requireRole("ADMIN", "IT"), exportRoutes);
app.use("/api/history", requireAuth, requireRole("ADMIN", "IT"), historyRoutes);
app.use("/api/users", requireAuth, requireRole("ADMIN", "IT"), userRoutes);
app.use("/api/users", requireAuth, requireRole("ADMIN", "IT"), userMfaRoutes);
app.use("/api/audit", requireAuth, requireRole("ADMIN"), auditRoutes);
app.use("/api/units", requireAuth, unitRoutes);
app.use(
  "/api/departments",
  requireAuth,
  requireRole("ADMIN"),
  departmentRoutes,
);

app.use("/api/kb/suggest", requireAuth, kbSuggestRoutes);
app.use(
  "/api/kb/search",
  requireAuth,
  requireRole("ADMIN", "IT"),
  kbSearchRoutes,
);
app.use("/api/kb", requireAuth, kbRoutes);

app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));

// Serve the built React client (production / UAT)
if (config.serveClient) {
  app.use(express.static(config.clientDist, { index: false }));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(config.clientDist, "index.html"));
  });
}

app.use(errorHandler);

async function start() {
  try {
    await query("SELECT 1");
    const deletedCount = await purgeOldAuditLogs({ query });
    if (deletedCount > 0) {
      console.log(
        `[audit] deleted ${deletedCount} log entries older than 14 days`,
      );
    }
  } catch (e) {
    console.error(
      "Cannot connect to the database or enforce audit log retention:",
      (e as Error).message,
    );
    process.exit(1);
  }

  const cleanupTimer = setInterval(() => {
    void purgeOldAuditLogs({ query })
      .then((deletedCount) => {
        if (deletedCount > 0) {
          console.log(
            `[audit] deleted ${deletedCount} log entries older than 14 days`,
          );
        }
      })
      .catch((e: Error) =>
        console.error("[audit] retention cleanup failed:", e.message),
      );
  }, AUDIT_LOG_CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();

  app.listen(config.port, config.bindAddress, () =>
    console.log(
      `API running on http://${config.bindAddress}:${config.port} (NODE_ENV=${config.nodeEnv})`,
    ),
  );
}

start();
