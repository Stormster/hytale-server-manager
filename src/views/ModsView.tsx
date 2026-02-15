import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useMods, useToggleMod } from "@/api/hooks/useMods";
import { useServerStatus } from "@/api/hooks/useServer";
import { useSettings } from "@/api/hooks/useSettings";
import { Lock, Download, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/api/client";

const REQUIRED_PREFIXES = ["nitrado-webserver", "nitrado-query"];

function hasRequiredMods(mods: { name: string }[]): boolean {
  const lower = (s: string) => s.toLowerCase();
  return REQUIRED_PREFIXES.every(
    (p) => mods.some((m) => lower(m.name).startsWith(p))
  );
}

export function ModsView() {
  const { data: settings } = useSettings();
  const { data: modsData, isLoading, refetch } = useMods();
  const { data: serverStatus } = useServerStatus();
  const toggleMod = useToggleMod();
  const [installing, setInstalling] = useState(false);

  const activeInstance = settings?.active_instance;
  const rootDir = (settings?.root_dir || "").replace(/[/\\]+$/, "");
  const sep = rootDir.includes("\\") ? "\\" : "/";
  const modsPath = activeInstance && rootDir ? [rootDir, activeInstance, "Server", "mods"].join(sep) : "";
  const running = serverStatus?.running ?? false;

  const openPathInExplorer = async (path: string) => {
    if (!path) return;
    try {
      await api<{ ok: boolean }>("/api/info/open-path", { method: "POST", body: JSON.stringify({ path }) });
    } catch {
      try {
        const { openPath } = await import("@tauri-apps/plugin-opener");
        await openPath(path);
      } catch {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(`file:///${path.replace(/\\/g, "/")}`);
      }
    }
  };

  const handleOpenFolder = () => openPathInExplorer(modsPath);

  const getModFolderPath = (modPath: string) => {
    if (!activeInstance || !rootDir) return "";
    const dirPart = modPath.includes("/") ? modPath.replace(/\/[^/]*$/, "") : "mods";
    const parts = dirPart.split("/");
    return [rootDir, activeInstance, "Server", ...parts].join(sep);
  };
  const mods = modsData?.mods ?? [];
  const missingRequired = !hasRequiredMods(mods);

  const handleInstallRequired = async () => {
    setInstalling(true);
    try {
      await api<{ ok: boolean }>("/api/mods/install-required", {
        method: "POST",
        body: "{}",
      });
      refetch();
    } catch {
      // Error shown via mutation
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Mods</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {running
              ? "Stop the server to enable or disable mods."
              : "Toggle mods on or off. Disabled mods are moved to a subfolder and not loaded."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {activeInstance && modsPath && (
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={handleOpenFolder}
              title="Open mods folder in File Explorer"
            >
              <FolderOpen className="h-4 w-4" />
              View Mods Folder
            </Button>
          )}
          {activeInstance && missingRequired && (
            <Button
              size="sm"
              onClick={handleInstallRequired}
              disabled={running || installing}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              {installing ? "Downloading..." : "Download required mods"}
            </Button>
          )}
        </div>
      </div>

      {!activeInstance ? (
        <p className="text-sm text-muted-foreground">No instance selected.</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading mods...</p>
      ) : mods.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No mods found. You can find them here:{" "}
            <a
              href="https://www.curseforge.com/hytale"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              https://www.curseforge.com/hytale
            </a>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {mods.map((mod) => (
            <Card
              key={mod.path}
              className={cn(!mod.enabled && "opacity-70")}
            >
              <CardContent className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate" title={mod.name}>{mod.displayName ?? mod.name}</span>
                    {mod.required && (
                      <span title="Required – cannot be disabled">
                        <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {mod.enabled ? "Enabled" : "Disabled"}
                    {mod.dataFolder != null && (
                      <>
                        {" · "}
                        <span title={mod.dataFolderExists ? "Folder exists" : "Plugin has not created this folder yet"}>
                          mods/{mod.dataFolder}
                          {!mod.dataFolderExists && " (—)"}
                        </span>
                      </>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={() => openPathInExplorer(getModFolderPath(mod.path))}
                    title="Open folder in File Explorer"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                  <Switch
                    checked={mod.enabled}
                    disabled={mod.required || running || toggleMod.isPending}
                    onCheckedChange={(checked) => {
                      if (mod.required) return;
                      toggleMod.mutate({ path: mod.path, enabled: checked });
                    }}
                    title={
                      mod.required
                        ? "Required mod – cannot be disabled"
                        : running
                          ? "Stop the server first"
                          : undefined
                    }
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
