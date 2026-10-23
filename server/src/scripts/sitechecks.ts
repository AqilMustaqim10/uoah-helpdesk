// Checks the LIVE website from the outside, the way a visitor (or an attacker) sees it. Run:
//   npx tsx src/scripts/sitecheck.ts https://helpdesk.yourcompany.com.my
// It never signs in and changes nothing (apart from one refused login attempt).
// If your company uses its own certificate authority, point Node at it first:
//   $env:NODE_EXTRA_CA_CERTS = "C:\certs\company-root.crt"
import tls from "node:tls";

const target = process.argv[2];
if (!target) {
  console.error(
    "Usage: npx tsx src/scripts/sitecheck.ts https://helpdesk.yourcompany.com.my",
  );
  process.exit(1);
}
let base: URL;
try {
  base = new URL(target);
} catch {
  console.error("That is not a valid address.");
  process.exit(1);
}

let fails = 0;
let warns = 0;
const line = (level: "OK" | "WARN" | "FAIL", text: string, hint?: string) => {
  if (level === "FAIL") fails++;
  if (level === "WARN") warns++;
  console.log(
    `${level === "OK" ? "[ OK ]" : level === "WARN" ? "[WARN]" : "[FAIL]"} ${text}`,
  );
  if (hint && level !== "OK") console.log(`       -> ${hint}`);
};
const check = (
  good: boolean,
  text: string,
  hint: string,
  level: "FAIL" | "WARN" = "FAIL",
) => (good ? line("OK", text) : line(level, text, hint));

function get(pathname: string, init: RequestInit = {}): Promise<Response> {
  return fetch(new URL(pathname, base), {
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
    ...init,
  });
}

/** The certificate the site shows (without trusting it, so we can report on it either way). */
function certificate(
  host: string,
  port: number,
): Promise<{ validTo: Date; trusted: boolean; reason: string }> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host, port, servername: host, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        const reason = socket.authorizationError
          ? String(socket.authorizationError)
          : "";
        socket.end();
        resolve({
          validTo: new Date(cert.valid_to),
          trusted: socket.authorized,
          reason,
        });
      },
    );
    socket.setTimeout(8000, () => {
      socket.destroy();
      reject(new Error("timed out"));
    });
    socket.on("error", reject);
  });
}

async function main() {
  console.log(`Checking ${base.origin}\n`);

  // ----- HTTPS and the certificate -----
  check(
    base.protocol === "https:",
    "The address starts with https://",
    "Give the https:// address.",
  );
  if (base.protocol === "https:") {
    try {
      const cert = await certificate(base.hostname, Number(base.port) || 443);
      const days = Math.floor(
        (cert.validTo.getTime() - Date.now()) / 86_400_000,
      );
      check(
        cert.trusted,
        "The certificate is trusted by this computer",
        `${cert.reason || "untrusted"}. For a company certificate authority set NODE_EXTRA_CA_CERTS.`,
        "WARN",
      );
      check(
        days > 21,
        `The certificate is valid for ${days} more day(s)`,
        "It expires soon: renew it.",
        days > 0 ? "WARN" : "FAIL",
      );
    } catch (e) {
      line("FAIL", "The certificate could be read", (e as Error).message);
    }

    // http:// must lead to https://
    try {
      const plain = new URL(base.origin);
      plain.protocol = "http:";
      plain.port = "";
      const res = await fetch(plain, {
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });
      const where = res.headers.get("location") ?? "";
      check(
        [301, 302, 307, 308].includes(res.status) &&
          where.startsWith("https://"),
        "http:// is redirected to https://",
        `Plain http answered ${res.status}. Caddy normally does this by itself (port 80 must be open).`,
      );
    } catch {
      line(
        "WARN",
        "http:// (port 80) could not be tested",
        "Port 80 is closed or blocked. Browsers typing the address without https:// will not connect.",
      );
    }
  }

  // ----- the website and its headers -----
  try {
    const home = await get("/");
    const h = (name: string) => home.headers.get(name);
    check(
      home.status === 200 && (h("content-type") ?? "").includes("text/html"),
      "The website opens",
      `Got status ${home.status}.`,
    );
    check(
      !!h("strict-transport-security"),
      "HSTS header (always use https)",
      "Missing: is NODE_ENV=production and REQUIRE_HTTPS on?",
    );
    check(
      !!h("content-security-policy"),
      "Content-Security-Policy header",
      "Missing: is SERVE_CLIENT on and the client built?",
    );
    check(
      (h("x-content-type-options") ?? "").toLowerCase() === "nosniff",
      "X-Content-Type-Options: nosniff",
      "Missing.",
    );
    check(!!h("x-frame-options"), "X-Frame-Options (no framing)", "Missing.");
    check(!!h("referrer-policy"), "Referrer-Policy", "Missing.");
    check(
      !h("x-powered-by"),
      'The server does not announce "Express"',
      "X-Powered-By is present.",
    );
  } catch (e) {
    line("FAIL", "The website opens", (e as Error).message);
  }

  // ----- the API -----
  try {
    const health = await get("/api/health");
    const body = (await health.json().catch(() => null)) as {
      ok?: boolean;
    } | null;
    check(
      health.status === 200 && body?.ok === true,
      "The API answers (/api/health)",
      `Status ${health.status}.`,
    );
  } catch (e) {
    line("FAIL", "The API answers (/api/health)", (e as Error).message);
  }

  // Nothing private may be reachable without signing in
  for (const p of [
    "/api/auth/me",
    "/api/tickets",
    "/api/stats",
    "/api/users",
    "/api/audit",
    "/api/export/tickets.pdf",
    "/api/files/1",
    "/api/kb",
    "/api/units",
  ]) {
    try {
      const res = await get(p);
      check(
        res.status === 401,
        `${p} needs a login`,
        `Answered ${res.status} instead of 401.`,
      );
    } catch (e) {
      line("FAIL", `${p} needs a login`, (e as Error).message);
    }
  }

  try {
    const res = await get("/api/this-does-not-exist");
    check(
      res.status === 404,
      "An unknown API address answers 404",
      `Answered ${res.status}.`,
    );
  } catch (e) {
    line("FAIL", "An unknown API address answers 404", (e as Error).message);
  }

  // Secret files must not be served as files
  for (const p of ["/.env", "/server/.env", "/.git/config", "/package.json"]) {
    try {
      const res = await get(p);
      const text = await res.text();
      check(
        !/JWT_SECRET|MFA_ENCRYPTION_KEY|\[core\]|"dependencies"/.test(text),
        `${p} is not served`,
        "A private file is reachable from the internet!",
      );
    } catch (e) {
      line("WARN", `${p} could not be tested`, (e as Error).message);
    }
  }

  // A page from another address must not be able to send requests
  try {
    const res = await get("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example",
      },
      body: JSON.stringify({
        email: "sitecheck@invalid.example",
        password: "not-a-real-password",
      }),
    });
    if (res.status === 403)
      line("OK", "A request from another website is blocked");
    else
      line(
        "WARN",
        "A request from another website could not be confirmed as blocked",
        `Answered ${res.status}. (This tool may not be allowed to send an Origin header; test in the browser console instead.)`,
      );
  } catch (e) {
    line("WARN", "The cross-site test could not run", (e as Error).message);
  }

  console.log(`\n${fails} failed, ${warns} warning(s).`);
  process.exitCode = fails === 0 ? 0 : 1;
}

main().catch((err: Error) => {
  console.error("The check itself failed:", err.message);
  process.exitCode = 1;
});
