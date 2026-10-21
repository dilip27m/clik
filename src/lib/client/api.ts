"use client";

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: Record<string, unknown>) {
    super(message);
  }
}

// fetch wrapper: JSON in/out, friendly errors, back to login when the session ends.
export async function api<T = unknown>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401 && !url.startsWith("/api/login")) {
    window.location.replace("/login");
    throw new ApiError("Please log in again", 401, {});
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error || "Something went wrong. Please try again.", res.status, json);
  return json as T;
}
