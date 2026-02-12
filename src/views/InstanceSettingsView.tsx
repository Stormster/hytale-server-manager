import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FolderOpen, Pencil } from "lucide-react";
import { useSettings } from "@/api/hooks/useSettings";
import { useInstances, useRenameInstance } from "@/api/hooks/useInstances";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export function InstanceSettingsView() {
  const { data: settings } = useSettings();
  const { data: instances } = useInstances();
  const renameInstance = useRenameInstance();

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const activeInstance = settings?.active_instance || "";
  const instance = instances?.find((i) => i.name === activeInstance);
  const rootDir = settings?.root_dir || "";
  const instancePath =
    rootDir && activeInstance
      ? `${rootDir.replace(/[/\\]+$/, "")}\\${activeInstance}`
      : "";

  const handleOpenFolder = async () => {
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

  const handleRenameSubmit = () => {
    if (!activeInstance || !renameValue.trim()) return;
    renameInstance.mutate(
      { name: activeInstance, newName: renameValue.trim() },
      {
        onSuccess: () => {
          setRenameDialogOpen(false);
          setRenameValue("");
        },
      }
    );
  };

  if (!activeInstance) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-muted-foreground">
          Select an instance from the sidebar to view its settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Instance Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>{activeInstance}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <Label className="text-muted-foreground">Name</Label>
                <p className="text-sm font-medium">{activeInstance}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRenameValue(activeInstance);
                  setRenameDialogOpen(true);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Rename
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Location</Label>
            <div className="flex items-center gap-2">
              <p className="flex-1 break-all rounded-md border bg-muted/30 px-3 py-2 text-sm">
                {instancePath || "—"}
              </p>
              <Button
                variant="outline"
                size="icon"
                onClick={handleOpenFolder}
                title="Open in File Explorer"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {instance && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Version</Label>
                <p className="text-sm">
                  {instance.installed ? `v${instance.version}` : "Not installed"}
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Channel</Label>
                <p className="text-sm">{instance.patchline}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
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
              <Button
                variant="outline"
                onClick={() => setRenameDialogOpen(false)}
              >
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
