/** Shared helpers for stopping game servers and exiting/restarting the Tauri app. */

export type LifecycleAction = "exit" | "restart";

export async function getRunningServerCount(): Promise<number> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const { getAuthHeaders } = await import("@/api/client");
    const port = await invoke<number>("get_backend_port");
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`http://127.0.0.1:${port}/api/server/status`, {
      headers: authHeaders,
    });
    if (!res.ok) return 0;
    const status = await res.json();
    const list = status?.running_instances;
    if (Array.isArray(list)) return list.length;
    return status?.running ? 1 : 0;
  } catch {
    return 0;
  }
}

/** Stop all game servers and wait until none are reported running (or timeout). */
export async function stopAllServersAndWait(timeoutMs = 15000): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  const { getAuthHeaders } = await import("@/api/client");
  const port = await invoke<number>("get_backend_port");
  const url = `http://127.0.0.1:${port}`;
  const authHeaders = await getAuthHeaders();
  const deadline = Date.now() + timeoutMs;
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(`${url}/api/server/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ all: true }),
      signal: ctrl.signal,
    });
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${url}/api/server/status`, {
          signal: ctrl.signal,
          headers: authHeaders,
        });
        const status = await res.json();
        const list = status?.running_instances;
        const stillRunning = Array.isArray(list)
          ? list.length > 0
          : Boolean(status?.running);
        if (!stillRunning) break;
      } catch {
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function closeAppWindow(): Promise<void> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  try {
    await win.destroy();
  } catch {
    try {
      await win.close();
    } catch {
      /* give up */
    }
  }
}

export async function restartApp(): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("restart_app");
}

export async function performLifecycleAction(action: LifecycleAction): Promise<void> {
  try {
    await stopAllServersAndWait();
  } catch {
    // Backend may already be gone — continue with exit/restart
  }
  if (action === "restart") {
    await restartApp();
  } else {
    await closeAppWindow();
  }
}
