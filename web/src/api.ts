export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const csrf = () =>
  document.cookie
    .split("; ")
    .find((c) => c.startsWith("mv_csrf="))
    ?.slice(8) ?? "";
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
  envelope = false,
): Promise<T> {
  const response = await fetch(
    path.startsWith("/auth/") ? path : "/api/v1" + path,
    {
      ...options,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf(),
        ...options.headers,
      },
    },
  );
  if (!response.ok) {
    const result = await response
      .json()
      .catch(() => ({ error: { message: "Unable to reach the server" } }));
    throw new ApiError(
      response.status,
      result.error?.message ?? "Request failed",
    );
  }
  const result = await response.json();
  return envelope ? result : result.data;
}
export const requestId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
export const post = <T = any>(path: string, body: unknown) =>
  api<T>(path, {
    method: "POST",
    headers: { "Idempotency-Key": requestId() },
    body: JSON.stringify(body),
  });
export const minutes = (n: number) =>
  `${Math.floor(n / 60)}h${n % 60 ? ` ${n % 60}m` : ""}`;
export const monthLabel = (date: string) =>
  new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
export const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
