"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

const PREFIX = "billbook:";

function readCache<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage full or blocked — the app still works, just without the instant start
  }
}

// Shows the last saved copy instantly, then refreshes from the server.
export function useCached<T>(url: string | null) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(url);

  const reload = useCallback(async () => {
    if (!url) return;
    latest.current = url;
    setLoading(true);
    try {
      const fresh = await api<T>(url);
      if (latest.current !== url) return;
      setData(fresh);
      setError(null);
      writeCache(url, fresh);
    } catch (e) {
      if (latest.current === url) setError(e instanceof Error ? e.message : "Could not load");
    } finally {
      if (latest.current === url) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (!url) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show cached copy before the network answers
    setData(readCache<T>(url));
    reload();
  }, [url, reload]);

  return { data, error, loading, reload };
}

export function clearCache() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
}
