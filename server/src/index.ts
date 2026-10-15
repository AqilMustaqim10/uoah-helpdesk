// Starts the API server (port 3000). Later steps add more routes in the marked spot.
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { config } from "./config/env";
import { query } from "./db/pool";
import { ah, HttpError } from "./lib/http";
import { requireAuth, requireRole } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import { originCheck } from "./middleware/originCheck";
import { apiLimiter } from "./middleware/rateLimit";
import authRoutes from "./routes/auth";
import ticketRoutes from "./routes/tickets";
import commentRoutes from "./routes/comments";
import ticketFileRoutes from "./routes/ticketFiles";
import fileRoutes from "./routes/files";
import statsRoutes from "./routes/stats";
import exportRoutes from "./routes/export";
import userRoutes from "./routes/users";
import unitRoutes from "./routes/units";
import kbRoutes from "./routes/kb";

const app = express();

app.disable("x-powered-by"); // don't advertise that we use Express

// Basic safety headers on every response
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// Only our web app may call the API from a browser, and it may send the login cookie.
app.use(cors({ origin: config.clientOrigin, credentials: true }));
// 256 KB: knowledge base articles can be up to 50,000 characters (some may use multi-byte letters)
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());

// Overall rate limit + "must come from our web app" check for every /api call
app.use("/api", apiLimiter, originCheck);

// A quick "is it alive?" check (also tests the database connection)
app.get(
  "/api/health",
  ah(async (_req, res) => {
    await query("SELECT 1");
    res.json({ ok: true });
  }),
);

app.use("/api/auth", authRoutes);

// Everything below needs a logged-in user (requireAuth runs first)
app.use(
  "/api/tickets",
  requireAuth,
  ticketRoutes,
  commentRoutes,
  ticketFileRoutes,
);
app.use("/api/files", requireAuth, fileRoutes);
// Dashboard numbers and CSV export: IT and ADMIN only (a USER gets "not found")
app.use("/api/stats", requireAuth, requireRole("ADMIN", "IT"), statsRoutes);
app.use("/api/export", requireAuth, requireRole("ADMIN", "IT"), exportRoutes);
// User Directory: ADMIN only
app.use("/api/users", requireAuth, requireRole("ADMIN"), userRoutes);
// Branding: the logo is for any logged-in user of that unit; changes are ADMIN only (checked inside)
app.use("/api/units", requireAuth, unitRoutes);
// Knowledge base: visibility and write rules are enforced inside (articleScope / canWriteArticle)
app.use("/api/kb", requireAuth, kbRoutes);

// Any other /api address does not exist
app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));

// Must be last: turns errors into clean JSON answers
app.use(errorHandler);

async function start() {
  // Refuse to start if the database is unreachable (clearer than failing on the first request)
  try {
    await query("SELECT 1");
  } catch (e) {
    console.error("Cannot connect to the database:", (e as Error).message);
    process.exit(1);
  }
  app.listen(config.port, () =>
    console.log(`API running on http://localhost:${config.port}`),
  );
}

start();
