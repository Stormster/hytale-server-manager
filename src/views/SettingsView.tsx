import { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { AuthFlowDisplay } from "@/components/AuthFlowDisplay";
import { InfoRow } from "@/components/InfoRow";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { FolderOpen, Pencil, Folder, Wrench, Download } from "lucide-react";
import { useAuthStatus, useInvalidateAuth } from "@/api/hooks/useAuth";
import { useAppInfo, useManagerUpdate } from "@/api/hooks/useInfo";
import { useSettings, useUpdateSettings } from "@/api/hooks/useSettings";
import { useInstances, useRenameInstance } from "@/api/hooks/useInstances";
import { useServerStatus } from "@/api/hooks/useServer";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeSSE, api } from "@/api/client";
import { parseAuthOutput } from "@/lib/authOutput";
import { toast } from "sonner";

export function SettingsView() {
  const { data: authStatus } = useAuthStatus();
  const { data: appInfo } = useAppInfo();
  const { data: managerUpdate } = useManagerUpdate();
  const { data: settings } = useSettings();
  const { data: instances } = useInstances();
  const { data: serverStatus } = useServerStatus();
  const queryClient = useQueryClient();
  const updateSettings = useUpdateSettings();
  const renameInstance = useRenameInstance();
  const invalidateAuth = useInvalidateAuth();

  const [authRunning, setAuthRunning] = useState(false);
  const [authLines, setAuthLines] = useState<string[]>([]);
  const authLinesRef = useRef<string[]>([]);
  const autoOpenedRef = useRef(false);
  const [rootDir, setRootDir] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [fixingPerms, setFixingPerms] = useState(false);
  const [fixingPort, setFixingPort] = useState(false);
  const [fetchingDownloader, setFetchingDownloader] = useState(false);

  const running = serverStatus?.running ?? false;

  const activeInstance = settings?.active_instance || "";
  const instance = instances?.find((i) => i.name === activeInstance);
  const rootDirPath = settings?.root_dir || "";
  const instancePath =
    rootDirPath && activeInstance
      ? `${rootDirPath.replace(/[/\\]+$/, "")}\\${activeInstance}`
      : "";

  // Initialize rootDir from settings
  const currentRoot = settings?.root_dir || "";
  if (rootDir === "" && currentRoot) {
    setRootDir(currentRoot);
  }

  const handleRefreshAuth = useCallback(() => {
    setAuthRunning(true);
    setAuthLines([]);
    authLinesRef.current = [];
    autoOpenedRef.current = false;

    subscribeSSE(
      "/api/auth/refresh",
      {
        onEvent(event, data) {
          const d = data as Record<string, unknown>;
          if (event === "output") {
            const line = d.line as string;
            authLinesRef.current = [...authLinesRef.current, line];
            setAuthLines(authLinesRef.current);
            if (!autoOpenedRef.current) {
              const { authUrl } = parseAuthOutput(authLinesRef.current);
              if (authUrl) {
                autoOpenedRef.current = true;
                import("@tauri-apps/plugin-opener")
                  .then(({ openUrl }) => openUrl(authUrl))
                  .catch(() =>
                    import("@tauri-apps/plugin-shell").then(({ open }) =>
                      open(authUrl)
                    )
                  )
                  .catch(() => {});
              }
            }
          } else if (event === "done") {
            const code = d.code as number;
            if (code === 0) {
              setAuthLines((prev) => [
                ...prev,
                "Auth refreshed successfully.",
              ]);
            } else {
              setAuthLines((prev) => [
                ...prev,
                "Auth may have failed. Please try again.",
              ]);
            }
            setAuthRunning(false);
            invalidateAuth();
          }
        },
        onError() {
          setAuthLines((prev) => [...prev, "Connection error."]);
          setAuthRunning(false);
        },
      },
      { method: "POST" }
    );
  }, [invalidateAuth]);

  const handleBrowseRoot = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        setRootDir(selected as string);
      }
    } catch {
      // Not in Tauri
    }
  };

  const handleSaveRoot = () => {
    if (rootDir.trim()) {
      updateSettings.mutate({ root_dir: rootDir.trim() });
    }
  };

  const handleOpenInstanceFolder = async () => {
    if (!instancePath) return;
    try {
      const { openPath } = await import("@tauri-apps/plugin-opener");
      await openPath(instancePath);
    } catch {
      try {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(`file:///${instancePath.replace(/\\/g, "/")}`);
      } catch {
        console.warn("Could not open folder");
      }
    }
  };

  const handleRenameClick = () => {
    setRenameValue(activeInstance);
    setRenameOpen(true);
  };

  const handleEnsureQueryPermissions = async () => {
    setFixingPerms(true);
    try {
      await api<{ ok: boolean }>("/api/mods/ensure-query-permissions", {
        method: "POST",
        body: "{}",
      });
    } finally {
      setFixingPerms(false);
    }
  };

  const handleEnsureWebserverPort = async () => {
    setFixingPort(true);
    try {
      await api<{ ok: boolean }>("/api/mods/ensure-webserver-port", {
        method: "POST",
        body: "{}",
      });
      queryClient.invalidateQueries({ queryKey: ["mods"] });
    } finally {
      setFixingPort(false);
    }
  };

  const handleRenameSubmit = () => {
    if (!activeInstance || !renameValue.trim()) return;
    renameInstance.mutate(
      { name: activeInstance, newName: renameValue.trim() },
      {
        onSuccess: () => {
          setRenameOpen(false);
          setRenameValue("");
        },
      }
    );
  };

  const handleFetchDownloader = useCallback(() => {
    if (fetchingDownloader) return;
    setFetchingDownloader(true);
    subscribeSSE(
      "/api/info/fetch-downloader",
      {
        onEvent(event, data) {
          const d = data as Record<string, unknown>;
          if (event === "done") {
            const ok = d.ok as boolean;
            const msg = d.message as string;
            setFetchingDownloader(false);
            queryClient.invalidateQueries({ queryKey: ["info"] });
            if (ok) {
              toast.success("Downloader installed successfully");
            } else {
              toast.error(msg || "Download failed");
            }
          }
        },
        onError() {
          setFetchingDownloader(false);
          toast.error("Connection error");
        },
      },
      { method: "POST" }
    );
  }, [fetchingDownloader, queryClient]);

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h2 className="text-xl font-bold">Settings</h2>

      {/* Current instance card */}
      {activeInstance && activeInstance !== "None" && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-lg">{activeInstance}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Active server instance
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRenameClick}
                className="shrink-0"
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Rename
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Location
              </Label>
              <div className="flex gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-muted/20 px-3 py-2.5">
                  <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm text-foreground">
                    {instancePath || "—"}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleOpenInstanceFolder}
                  title="Open in File Explorer"
                  className="shrink-0"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {instance && (
              <div className="grid grid-cols-2 gap-4 rounded-lg border border-white/10 bg-muted/10 px-4 py-3">
                <div>
                  <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Version
                  </Label>
                  <p className="mt-0.5 text-sm font-medium">
                    {instance.installed
                      ? `v${instance.version}`
                      : "Not installed"}
                  </p>
                </div>
                <div>
                  <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Channel
                  </Label>
                  <p className="mt-0.5 text-sm font-medium capitalize">
                    {instance.patchline}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Root directory card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Servers Root Folder</CardTitle>
          <p className="text-sm text-muted-foreground">
            The directory where all server instances are stored.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="settings-root">Path</Label>
            <div className="flex gap-2">
              <input
                id="settings-root"
                type="text"
                value={rootDir}
                onChange={(e) => setRootDir(e.target.value)}
                className="flex-1 rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button variant="outline" size="icon" onClick={handleBrowseRoot}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleSaveRoot}
            disabled={
              rootDir.trim() === currentRoot || updateSettings.isPending
            }
          >
            {updateSettings.isPending ? "Saving..." : "Save"}
          </Button>
        </CardContent>
      </Card>

      {/* Nitrado plugins troubleshooting */}
      {activeInstance && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nitrado Plugins</CardTitle>
            <p className="text-sm text-muted-foreground">
              Fix common issues with Nitrado WebServer and Query plugins.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleEnsureWebserverPort}
              disabled={running || fixingPort}
              className="gap-2"
              title="Assign a unique WebServer port. Use when switching instances to avoid port conflicts."
            >
              <Wrench className="h-4 w-4" />
              {fixingPort ? "Updating..." : "Fix port conflict"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleEnsureQueryPermissions}
              disabled={fixingPerms}
              className="gap-2"
              title="Add nitrado.query.web.read.basic to ANONYMOUS. Restart the server for changes to apply."
            >
              {fixingPerms ? "Updating..." : "Fix player count"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Auth card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Authentication</CardTitle>
          <p className="text-sm text-muted-foreground">
            Delete stored credentials and re-authenticate with your Hytale
            account.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p
            className={`text-sm font-medium ${
              authStatus?.has_credentials
                ? "text-emerald-500"
                : "text-red-500"
            }`}
          >
            {authStatus?.has_credentials
              ? "Credentials found"
              : "No credentials \u2013 auth required"}
          </p>
          <Button
            onClick={handleRefreshAuth}
            disabled={authRunning}
          >
            {authRunning ? "Authenticating..." : "Refresh Auth"}
          </Button>
          {authLines.length > 0 && (
            <AuthFlowDisplay lines={authLines} className="space-y-3" />
          )}
        </CardContent>
      </Card>

      {/* About card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <InfoRow
            label="Manager version"
            value={`v${appInfo?.manager_version ?? "..."}`}
          />
          <InfoRow
            label="Latest version"
            value={
              managerUpdate
                ? managerUpdate.update_available
                  ? `v${managerUpdate.latest_version} (update available!)`
                  : `v${managerUpdate.latest_version} (up to date)`
                : "checking..."
            }
          />
          <InfoRow
            label="Java"
            value={
              appInfo
                ? appInfo.java_ok
                  ? appInfo.java_version
                  : "Not found"
                : "..."
            }
          />
          <InfoRow
            label="Downloader"
            value={
              appInfo
                ? appInfo.has_downloader
                  ? "Found"
                  : "Not found"
                : "..."
            }
          />
          {appInfo && !appInfo.has_downloader && (
            <div className="pt-2">
              <Button
                size="sm"
                onClick={handleFetchDownloader}
                disabled={fetchingDownloader}
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                {fetchingDownloader ? "Downloading..." : "Download Hytale downloader"}
              </Button>
            </div>
          )}

          <Separator className="my-3" />

          <p className="text-xs text-muted-foreground">
            <a
              href="https://github.com/Stormster/hytale-server-manager/issues"
              target="_blank"
              rel="noreferrer"
              className="text-foreground hover:underline"
            >
              Report issues on GitHub
            </a>
          </p>
        </CardContent>
      </Card>

      {/* Rename instance dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Instance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="instance-rename-input">Name</Label>
              <input
                id="instance-rename-input"
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="My Survival Server"
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {renameInstance.isError && (
              <p className="text-sm text-red-500">
                {(renameInstance.error as Error).message}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleRenameSubmit}
                disabled={!renameValue.trim() || renameInstance.isPending}
              >
                {renameInstance.isPending ? "Renaming…" : "Rename"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
