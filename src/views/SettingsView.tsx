import { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { AuthFlowDisplay } from "@/components/AuthFlowDisplay";
import { InfoRow } from "@/components/InfoRow";
import { FolderOpen, ServerCog } from "lucide-react";
import { useAuthStatus, useInvalidateAuth } from "@/api/hooks/useAuth";
import { useAppInfo, useManagerUpdate } from "@/api/hooks/useInfo";
import { useSettings, useUpdateSettings } from "@/api/hooks/useSettings";
import { subscribeSSE } from "@/api/client";
import { parseAuthOutput } from "@/lib/authOutput";

interface SettingsViewProps {
  onManageInstance?: () => void;
}

export function SettingsView({ onManageInstance }: SettingsViewProps) {
  const { data: authStatus } = useAuthStatus();
  const { data: appInfo } = useAppInfo();
  const { data: managerUpdate } = useManagerUpdate();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const invalidateAuth = useInvalidateAuth();

  const [authRunning, setAuthRunning] = useState(false);
  const [authLines, setAuthLines] = useState<string[]>([]);
  const authLinesRef = useRef<string[]>([]);
  const autoOpenedRef = useRef(false);
  const [rootDir, setRootDir] = useState("");

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

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h2 className="text-xl font-bold">Settings</h2>

      {/* Manage instance card */}
      {onManageInstance && settings?.active_instance && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current Instance</CardTitle>
            <p className="text-sm text-muted-foreground">
              Rename, view location, or manage the active server instance.
            </p>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={onManageInstance}>
              <ServerCog className="mr-2 h-4 w-4" />
              Manage instance
            </Button>
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

          <Separator className="my-3" />

          <p className="text-xs text-muted-foreground">
            GitHub: github.com/{appInfo?.github_repo ?? "..."}
          </p>
          <p className="text-xs text-muted-foreground">
            Issues: {appInfo?.report_url ?? "..."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
