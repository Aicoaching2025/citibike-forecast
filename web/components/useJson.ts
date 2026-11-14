"use client";

import { useEffect, useState } from "react";

/** Fetch JSON from our API with cancellation; returns { data, error, loading }. */
export function useJson<T>(url: string | null) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: !!url });
  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(url, { signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.error ?? `Request failed (${r.status})`);
        setState({ data: body.data as T, error: null, loading: false });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ data: null, error: e instanceof Error ? e.message : "Request failed", loading: false });
      });
    return () => ctrl.abort();
  }, [url]);
  return state;
}
