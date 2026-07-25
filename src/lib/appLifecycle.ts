/** Shared helpers for stopping game servers and exiting/restarting the Tauri app. */

import { invoke } from "@tauri-apps/api/core";
import { getAuthHeaders, getBaseUrl } from "@/api/client";
import type { ServerStatus } from "@/api/types";

export type LifecycleAction = "exit" | "restart";

export function countRunningFromStatus(status: ServerStatus | null | undefined): number {
  if (!status) return 0;
  const list = status.running_instances;
  if (Array.isArray(list)) return list.length;
  return status.running ? 1 : 0;
}

/** Live fetch of running server count (uses cached base URL / auth). */
export async function getRunningServerCount(timeoutMs = 1500): Promise<number> {
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const base = await getBaseUrl();
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`${base}/api/server/status`, {
      headers: authHeaders,
      signal: ctrl.signal,
    });
    if (!res.ok) return 0;
    const status = (await res.json()) as ServerStatus;
    return countRunningFromStatus(status);
  } catch {
    return 0;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Stop all game servers and wait until none are reported running (or timeout). */
export async function stopAllServersAndWait(timeoutMs = 15000): Promise<void> {
  const base = await getBaseUrl();
  const authHeaders = await getAuthHeaders();
  const deadline = Date.now() + timeoutMs;
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(`${base}/api/server/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ all: true }),
      signal: ctrl.signal,
    });
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${base}/api/server/status`, {
          signal: ctrl.signal,
          headers: authHeaders,
        });
        const status = (await res.json()) as ServerStatus;
        if (countRunningFromStatus(status) === 0) break;
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
