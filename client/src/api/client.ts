// One place that talks to the server. Every request:
//  - goes to /api/... (the Vite proxy forwards it to port 3000)
//  - sends the login cookie automatically
//  - turns errors into a friendly ApiError with a readable message
// It can send JSON, send files (FormData), and download files (Blob).

/** An error from the server (or from not reaching it). status 0 = could not connect. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;

/** AuthContext registers a function here that runs when the server says "please sign in". */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/** Sends the request. Network failures become ApiError(0). */
async function send(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  try {
    return await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      // For files the browser sets the Content-Type itself (it must include a boundary), so we must not.
      headers:
        body !== undefined && !isForm
          ? { "Content-Type": "application/json" }
          : undefined,
      body:
        body === undefined
          ? undefined
          : isForm
            ? (body as FormData)
            : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      "Cannot reach the server. Please check that it is running.",
    );
  }
}

/** Turns a failed response into an ApiError with the server's own message when there is one. */
async function toError(res: Response): Promise<ApiError> {
  // Read as text first, so an empty or non-JSON answer cannot crash us
  const text = await res.text();
  let data: { error?: string } | null = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (res.status === 401) onUnauthorized?.();

  let message = data?.error;
  if (!message) {
    message =
      res.status >= 500
        ? "Cannot reach the server. Please check that it is running."
        : "Request failed. Please try again.";
  }
  return new ApiError(res.status, message);
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await send(method, path, body);
  if (!res.ok) throw await toError(res);

  const text = await res.text();
  if (!text) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null as T;
  }
}

/** Downloads a file as a Blob (used for the CSV export). */
async function download(
  path: string,
  fallbackName: string,
): Promise<{ blob: Blob; filename: string }> {
  const res = await send("GET", path);
  if (!res.ok) throw await toError(res);

  const blob = await res.blob();
  const match = /filename="([^"]+)"/.exec(
    res.headers.get("Content-Disposition") ?? "",
  );
  return { blob, filename: match ? match[1] : fallbackName };
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown = {}) =>
    request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
  download,
};
