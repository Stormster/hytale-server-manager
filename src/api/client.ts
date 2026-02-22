import { invoke } from "@tauri-apps/api/core";

let _baseUrl: string | null = null;
let _portPromise: Promise<string> | null = null;

/**
 * Get the backend base URL. In Tauri, queries the sidecar port.
 * Falls back to localhost:21342 for standalone dev.
 */
async function getBaseUrl(): Promise<string> {
  if (_baseUrl) return _baseUrl;

  if (!_portPromise) {
    _portPromise = (async () => {
      // Try to get port from Tauri sidecar
      try {
        // Poll until backend is ready (max ~10s)
        for (let i = 0; i < 50; i++) {
          try {
            const port = await invoke<number>("get_backend_port");
            if (port) {
              _baseUrl = `http://127.0.0.1:${port}`;
              return _baseUrl;
            }
          } catch {
            // Backend not ready yet
          }
          await new Promise((r) => setTimeout(r, 200));
        }
      } catch {
        // Not running in Tauri – use default dev port
      }

      // Fallback for dev mode without Tauri
      _baseUrl = "http://127.0.0.1:21342";
      return _baseUrl;
    })();
  }

  return _portPromise;
}

/**
 * Typed fetch wrapper for the backend API.
 */
export async function api<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const base = await getBaseUrl();
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Upload files (e.g. FormData). Does not set Content-Type so browser sets multipart boundary.
 */
export async function apiUpload<T>(
  path: string,
  body: FormData,
  options?: Omit<RequestInit, "body" | "headers">
): Promise<T> {
  const base = await getBaseUrl();
  const res = await fetch(`${base}${path}`, {
    ...options,
    method: options?.method ?? "POST",
    body,
    headers: options?.headers,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || data.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Subscribe to an SSE endpoint. Returns an abort function.
 */
export function subscribeSSE(
  path: string,
  handlers: {
    onEvent?: (event: string, data: unknown) => void;
    onError?: (err: Error) => void;
    onDone?: () => void;
  },
  options?: { method?: string; body?: string }
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const base = await getBaseUrl();
      const res = await fetch(`${base}${path}`, {
        method: options?.method || "GET",
        headers: options?.body
          ? { "Content-Type": "application/json" }
          : undefined,
        body: options?.body,
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`SSE request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "message";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const raw = line.slice(6);
            try {
              const data = JSON.parse(raw);
              handlers.onEvent?.(currentEvent, data);
              if (currentEvent === "done") {
                handlers.onDone?.();
                return;
              }
            } catch {
              // ignore parse errors
            }
            currentEvent = "message";
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        handlers.onError?.(err as Error);
      }
    }
  })();

  return () => controller.abort();
}
