// The "front door" of the web app:
//  - security headers on every answer
//  - the HTTPS requirement (plain http is sent to https)
//  - serving the built website (client/dist) from the same address as the API
import fs from "node:fs";
import path from "node:path";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { config } from "../config/env";

// The browser may only load scripts, styles, pictures and connections from OUR OWN address.
// (Inline styles are allowed because the pages set a few colors and widths directly.)
// This is sent with the website's HTML page only: it must not be attached to PDFs and pictures served by the API.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", // data: = the 2FA QR code, blob: = previews of files that are about to be uploaded
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** Headers added to every response. */
export function securityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  // "Always use https for this address": browsers remember it for a year (ignored when sent over plain http)
  if (config.isProd && config.requireHttps)
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  next();
}

/** Plain http is redirected to https. Needs TRUST_PROXY=1 so that the proxy's "this was https" signal is believed. */
export function requireHttps(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!config.requireHttps || req.secure) return next();
  if (req.path === "/api/health") return next(); // the proxy's local health check may use plain http

  if (req.method === "GET" || req.method === "HEAD") {
    // The target is built from OUR configured address, never from the request's Host header (no open redirects)
    res.redirect(308, `${config.clientOrigin}${req.originalUrl}`);
    return;
  }
  res.status(426).json({ error: "HTTPS is required." });
}

/** Serves client/dist (the built website). Call it AFTER all API routes. */
export function mountClient(app: Express): void {
  if (!config.serveClient) return;

  const indexFile = path.join(config.clientDist, "index.html");
  if (!fs.existsSync(indexFile)) {
    console.warn(
      `[web] The website files were not found (${indexFile}). Run "npm run build" in the client folder, or set SERVE_CLIENT=false.`,
    );
    return;
  }

  // Files in /assets have a fingerprint in their name, so browsers may keep them for a year
  app.use(
    "/assets",
    express.static(path.join(config.clientDist, "assets"), {
      maxAge: "1y",
      immutable: true,
    }),
  );
  app.get("/assets/*", (_req, res) => {
    res.status(404).type("text/plain").send("Not found");
  });

  // Other files (the theme script, the icon) are always checked for updates
  app.use(
    express.static(config.clientDist, {
      index: false,
      maxAge: 0,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html"))
          res.setHeader("Content-Security-Policy", CSP);
      },
    }),
  );

  // Every other page address belongs to the website itself (it draws the right screen), except /api
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
    res.setHeader("Content-Security-Policy", CSP);
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(indexFile, { dotfiles: "allow" });
  });

  console.log(`[web] Serving the website from ${config.clientDist}`);
}
