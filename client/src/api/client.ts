// One place that talks to the server. Every request:
//  - goes to /api/... (the Vite proxy forwards it to port 3000)
//  - sends the login cookie automatically
//  - turns errors into a friendly ApiError with a readable message

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

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers:
        body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      0,
      "Cannot reach the server. Please check that it is running.",
    );
  }

  // Read the answer as text first, so an empty or non-JSON answer cannot crash us.
  const text = await res.text();
  let data: { error?: string } | null = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    let message = data?.error;
    if (!message) {
      message =
        res.status >= 500
          ? "Cannot reach the server. Please check that it is running."
          : "Request failed. Please try again.";
    }
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown = {}) =>
    request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};
