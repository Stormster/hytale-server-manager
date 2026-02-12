import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FolderOpen } from "lucide-react";
import { useSettings, useUpdateSettings } from "@/api/hooks/useSettings";

const DEFAULT_PLACEHOLDER = "Documents\\Hytale Servers";

export function OnboardingView() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const defaultPath = settings?.default_root_dir ?? "";
  const [rootDir, setRootDir] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (defaultPath && !initialized.current) {
      setRootDir(defaultPath);
      initialized.current = true;
    }
  }, [defaultPath]);

  const handleBrowse = async () => {
    try {
      // Try Tauri dialog API
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        setRootDir(selected as string);
      }
    } catch {
      // Not in Tauri – user types path manually
    }
  };

  const handleSubmit = () => {
    const path = rootDir.trim() || defaultPath;
    if (!path) return;
    updateSettings.mutate({ root_dir: path });
  };

  return (
    <div className="relative flex h-screen w-screen items-center justify-center p-6">
      <div className="hytale-bg">
        <div className="hytale-bg-image" />
        <div className="hytale-bg-overlay" />
      </div>
      <Card className="relative w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            Welcome to Hytale Server Manager
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Choose a folder where your server instances will be stored. Each
            server you create will live in its own subfolder here.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="root-dir">Servers Root Folder</Label>
            <div className="flex gap-2">
              <input
                id="root-dir"
                type="text"
                value={rootDir}
                onChange={(e) => setRootDir(e.target.value)}
                placeholder={DEFAULT_PLACEHOLDER}
                className="flex-1 rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button variant="outline" size="icon" onClick={handleBrowse}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This folder will contain all your Hytale server instances, as well
              as the shared downloader and credentials.
            </p>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={(!rootDir.trim() && !defaultPath) || updateSettings.isPending}
            className="w-full"
          >
            {updateSettings.isPending ? "Setting up..." : "Get Started"}
          </Button>

          {updateSettings.isError && (
            <p className="text-sm text-red-500">
              {(updateSettings.error as Error).message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
