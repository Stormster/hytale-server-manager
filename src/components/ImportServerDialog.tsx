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
  const [successResult, setSuccessResult] = useState<{
    path: string;
    copied: boolean;
  } | null>(null);
  const importInstance = useImportInstance();
  const { data: settings } = useSettings();
  const destPath =
    settings?.root_dir && name.trim()
      ? `${settings.root_dir.replace(/[/\\]+$/, "")}\\${name.trim()}`
      : "";
  const isSuccess = !!successResult;

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
        onSuccess: (data: { name?: string; copied?: boolean }) => {
          if (data?.name && settings?.root_dir) {
            setSuccessResult({
              path: `${settings.root_dir.replace(/[/\\]+$/, "")}\\${data.name}`,
              copied: data.copied !== false,
            });
          }
        },
      }
    );
  };

  const handleClose = () => {
    setName("");
    setSourcePath("");
    setSuccessResult(null);
    importInstance.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isSuccess ? "Import Complete" : "Import Existing Server"}
          </DialogTitle>
          <DialogDescription>
            {isSuccess
              ? successResult?.copied
                ? "Your server has been copied to your root servers directory. Make future edits to files in that location, not the original folder."
                : "The server was already in your root directory and has been added to the manager."
              : "Point to an existing Hytale server folder. A copy will be created if it's not already in your servers directory."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isSuccess ? (
            <>
              <div className="rounded-md border bg-muted/50 px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {successResult?.copied ? "Copied to" : "Location"}
                </p>
                <p className="mt-0.5 text-sm font-medium break-all">
                  {successResult?.path}
                </p>
                {successResult?.copied && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    This is the copy in your root servers directory. Edit files
                    here, not in the original folder.
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button onClick={handleClose}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <>
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
                  Select the folder that contains your Assets.zip, with a Server/
                  subfolder and HytaleServer.jar inside.
                </p>
              </div>

              {destPath && (
                <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    Will be copied to{" "}
                    <span className="font-medium text-foreground break-all">
                      {destPath}
                    </span>
                  </p>
                </div>
              )}

              {importInstance.isError && (
                <p className="text-sm text-red-500">
                  {(importInstance.error as Error).message}
                </p>
              )}

              {importInstance.isPending && (
                <p className="text-sm text-muted-foreground">
                  {destPath ? (
                    <>
                      Importing to{" "}
                      <span className="font-medium text-foreground">
                        {destPath}
                      </span>
                      …
                    </>
                  ) : (
                    "Importing…"
                  )}
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
                  {importInstance.isPending ? "Importing…" : "Import"}
                </Button>
              </DialogFooter>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
