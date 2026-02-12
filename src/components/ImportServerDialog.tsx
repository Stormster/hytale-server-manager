import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FolderOpen } from "lucide-react";
import { useImportInstance } from "@/api/hooks/useInstances";
import { useSettings } from "@/api/hooks/useSettings";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportServerDialog({ open, onOpenChange }: Props) {
  const [name, setName] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const importInstance = useImportInstance();
  const { data: settings } = useSettings();
  const destPath =
    settings?.root_dir && name.trim()
      ? `${settings.root_dir.replace(/[/\\]+$/, "")}\\${name.trim()}`
      : "";

  const handleBrowse = async () => {
    try {
      const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
      const selected = await openDialog({ directory: true, multiple: false });
      if (selected) {
        setSourcePath(selected as string);
        // Auto-fill name from folder name if empty
        if (!name) {
          const parts = (selected as string)
            .replace(/[\\/]+$/, "")
            .split(/[\\/]/);
          setName(parts[parts.length - 1] || "");
        }
      }
    } catch {
      // Not in Tauri – user types path manually
    }
  };

  const handleImport = () => {
    if (!name.trim() || !sourcePath.trim()) return;
    importInstance.mutate(
      { name: name.trim(), source_path: sourcePath.trim() },
      {
        onSuccess: () => {
          handleClose();
        },
      }
    );
  };

  const handleClose = () => {
    setName("");
    setSourcePath("");
    importInstance.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Existing Server</DialogTitle>
          <DialogDescription>
            Point to an existing Hytale server folder. A copy will be created
            in your servers directory.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="import-name">Instance Name</Label>
            <input
              id="import-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Imported Server"
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="import-path">Source Folder</Label>
            <div className="flex gap-2">
              <input
                id="import-path"
                type="text"
                value={sourcePath}
                onChange={(e) => setSourcePath(e.target.value)}
                placeholder="C:\path\to\existing\server"
                className="flex-1 rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button variant="outline" size="icon" onClick={handleBrowse}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The folder should contain a Server/ directory with
              HytaleServer.jar.
            </p>
          </div>

          {importInstance.isError && (
            <p className="text-sm text-red-500">
              {(importInstance.error as Error).message}
            </p>
          )}

          {importInstance.isPending && destPath && (
            <p className="text-sm text-muted-foreground">
              Copying to{" "}
              <span className="font-medium text-foreground">{destPath}</span>
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={
                !name.trim() ||
                !sourcePath.trim() ||
                importInstance.isPending
              }
            >
              {importInstance.isPending ? "Copying…" : "Import"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
