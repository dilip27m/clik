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

// Same as api() for a POST, but reports how much of the request has been sent
// (0 → 1), so a big photo upload can show real progress.
export function apiUpload<T = unknown>(url: string, body: unknown, onProgress: (sent: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.upload.onload = () => onProgress(1);
    xhr.onerror = () => reject(new ApiError("No internet connection. Please try again.", 0, {}));
    xhr.ontimeout = () => reject(new ApiError("This is taking too long. Please try again.", 0, {}));
    xhr.onload = () => {
      if (xhr.status === 401) {
        window.location.replace("/login");
        return reject(new ApiError("Please log in again", 401, {}));
      }
      let json: Record<string, unknown> = {};
      try {
        json = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status < 200 || xhr.status >= 300) {
        return reject(new ApiError(String(json.error || "Something went wrong. Please try again."), xhr.status, json));
      }
      resolve(json as T);
    };
    xhr.timeout = 90000;
    xhr.send(JSON.stringify(body));
  });
}
