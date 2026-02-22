import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FolderOpen,
  Pencil,
  Trash2,
  Plus,
  FolderInput,
} from "lucide-react";
import {
  useInstances,
  useSetActiveInstance,
  useRenameInstance,
} from "@/api/hooks/useInstances";
import { useSettings } from "@/api/hooks/useSettings";
import { DeleteInstanceDialog } from "@/components/DeleteInstanceDialog";
import { Label } from "@/components/ui/label";

interface InstancesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddServer: () => void;
  onImportServer: () => void;
}

export function InstancesModal({
  open,
  onOpenChange,
  onAddServer,
  onImportServer,
}: InstancesModalProps) {
  const { data: instances } = useInstances();
  const { data: settings } = useSettings();
  const setActive = useSetActiveInstance();
  const renameInstance = useRenameInstance();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [instanceToDelete, setInstanceToDelete] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [instanceToRename, setInstanceToRename] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const rootDir = settings?.root_dir || "";
  const sep = rootDir.includes("\\") ? "\\" : "/";

  const handleOpenFolder = async (name: string) => {
    const path = [rootDir.replace(/[/\\]+$/, ""), name].join(sep);
    const { openPathInExplorer } = await import("@/lib/openPath");
    await openPathInExplorer(path);
  };

  const handleRenameClick = (name: string) => {
    setInstanceToRename(name);
    setRenameValue(name);
    setRenameDialogOpen(true);
  };

  const handleRenameSubmit = () => {
    if (!instanceToRename || !renameValue.trim()) return;
    renameInstance.mutate(
      { name: instanceToRename, newName: renameValue.trim() },
      {
        onSuccess: () => {
          setRenameDialogOpen(false);
          setInstanceToRename(null);
          setRenameValue("");
        },
      }
    );
  };

  const activeInstance = settings?.active_instance || "";

  const handleAddFromEmpty = () => {
    onOpenChange(false);
    onAddServer();
  };

  const handleImportFromEmpty = () => {
    onOpenChange(false);
    onImportServer();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Instances</DialogTitle>
          </DialogHeader>
          {instances && instances.length > 0 ? (
            <div className="rounded-md border">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-3 text-left text-sm font-medium">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium">
                          Version
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium">
                          Channel
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-medium">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {instances.map((inst) => (
                        <tr
                          key={inst.name}
                          className={`border-b transition-colors last:border-0 ${
                            inst.name === activeInstance
                              ? "bg-accent/30"
                              : "hover:bg-muted/30"
                          }`}
                        >
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setActive.mutate(inst.name)}
                              className="text-left font-medium hover:underline"
                            >
                              {inst.name}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {inst.installed
                              ? `v${inst.version}`
                              : "Not installed"}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {inst.patchline}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleOpenFolder(inst.name)}
                                title="Open in File Explorer"
                              >
                                <FolderOpen className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleRenameClick(inst.name)}
                                title="Rename"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => {
                                  setInstanceToDelete(inst.name);
                                  setDeleteDialogOpen(true);
                                }}
                                title="Remove"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                </table>
              </div>
          ) : (
            <div className="py-8 text-center space-y-3">
              <p className="text-muted-foreground">
                No instances yet. Add or import a server to get started.
              </p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" size="sm" onClick={handleAddFromEmpty}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Server
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleImportFromEmpty}
                >
                  <FolderInput className="mr-2 h-4 w-4" />
                  Import Existing
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Instance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rename-input">Name</Label>
              <input
                id="rename-input"
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
                disabled={
                  !renameValue.trim() || renameInstance.isPending
                }
              >
                {renameInstance.isPending ? "Renaming…" : "Rename"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteInstanceDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setInstanceToDelete(null);
        }}
        instanceName={instanceToDelete}
      />
    </>
  );
}
