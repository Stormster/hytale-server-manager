/**
 * Open a path (file or folder) in the system file manager.
 * Uses the backend API first (explorer.exe on Windows for correct foreground focus),
 * then falls back to Tauri plugins.
 */
export async function openPathInExplorer(path: string): Promise<void> {
  if (!path) return;
  try {
    const { api } = await import("@/api/client");
    await api<{ ok: boolean }>("/api/info/open-path", {
      method: "POST",
      body: JSON.stringify({ path }),
    });
  } catch {
    try {
      const { openPath } = await import("@tauri-apps/plugin-opener");
      await openPath(path);
    } catch {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(`file:///${path.replace(/\\/g, "/")}`);
    }
  }
}
