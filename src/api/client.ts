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

const FETCH_TIMEOUT_MS = 15_000;

/**
 * Typed fetch wrapper for the backend API.
 * Uses AbortController to enforce a timeout so we never hang indefinitely.
 */
export async function api<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const base = await getBaseUrl();
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      ...options,
      signal: ctrl.signal,
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
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error("Connection timed out");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Upload files (e.g. FormData). Does not set Content-Type so browser sets multipart boundary.
 */
export async function apiUpload<T>(
  path: string,
  body: FormData,
  options?: Omit<RequestInit, "body">
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
 * Uses native EventSource for GET requests (more reliable in Tauri WebView);
 * falls back to fetch for POST or when EventSource fails.
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
  const method = options?.method || "GET";
  const hasBody = !!options?.body;
  let closed = false;
  const controller = new AbortController();

  const doFetch = async (signal: AbortSignal) => {
    const base = await getBaseUrl();
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: hasBody ? { "Content-Type": "application/json" } : undefined,
        body: options?.body,
        signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`SSE request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!closed) {
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
      if (!closed && (err as Error).name !== "AbortError") {
        handlers.onError?.(err as Error);
      }
    }
  };

  // Use native EventSource for GET with no body - more reliable in WebView2
  if (method === "GET" && !hasBody) {
    let eventSource: EventSource | null = null;
    (async () => {
      try {
        const base = await getBaseUrl();
        const url = `${base}${path}`;
        eventSource = new EventSource(url);

        eventSource.onerror = () => {
          if (closed) return;
          if (eventSource?.readyState === EventSource.CLOSED) return;
          handlers.onError?.(new Error("EventSource connection failed"));
          eventSource?.close();
        };

        for (const name of ["status", "progress", "done", "ping", "message"]) {
          eventSource.addEventListener(name, (e: MessageEvent) => {
            if (closed) return;
            if (name === "ping") return;
            try {
              const data = JSON.parse(String((e as MessageEvent).data || "{}"));
              handlers.onEvent?.(name, data);
              if (name === "done") {
                closed = true;
                handlers.onDone?.();
                eventSource?.close();
              }
            } catch {
              // ignore parse errors
            }
          });
        }
      } catch (err) {
        if (!closed) {
          handlers.onError?.(err as Error);
        }
      }
    })();

    return () => {
      closed = true;
      eventSource?.close();
    };
  }

  // Fallback to fetch for POST or when body is needed
  doFetch(controller.signal);
  return () => {
    closed = true;
    controller.abort();
  };
}
