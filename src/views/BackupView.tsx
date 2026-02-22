import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useBackups,
  useCreateBackup,
  useRestoreBackup,
  useRenameBackup,
  useDeleteBackup,
} from "@/api/hooks/useBackups";
import type { Backup } from "@/api/types";
import { Pencil } from "lucide-react";

export function BackupView() {
  const { data: backups, isLoading } = useBackups();
  const createBackup = useCreateBackup();
  const restoreBackup = useRestoreBackup();
  const renameBackup = useRenameBackup();
  const deleteBackup = useDeleteBackup();

  const [confirmDialog, setConfirmDialog] = useState<{
    type: "restore" | "delete";
    backup: Backup;
  } | null>(null);
  const [renameDialog, setRenameDialog] = useState<{ backup: Backup; value: string } | null>(null);

  const handleConfirm = () => {
    if (!confirmDialog) return;
    const { type, backup } = confirmDialog;
    if (type === "restore") {
      restoreBackup.mutate(backup.folder_name);
    } else {
      deleteBackup.mutate(backup.folder_name);
    }
    setConfirmDialog(null);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "Unknown";
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold">Backups</h2>
        <Button
          onClick={() => createBackup.mutate(undefined)}
          disabled={createBackup.isPending}
        >
          {createBackup.isPending ? "Creating..." : "Create Backup"}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        {isLoading
          ? "Loading..."
          : backups && backups.length > 0
            ? `${backups.length} backup(s)`
            : "No backups found. Create one to get started."}
      </p>

      {/* Backup list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-3 pr-4">
          {backups?.map((backup) => (
            <Card key={backup.folder_name}>
              <CardContent className="py-4 px-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant={
                          backup.backup_type === "pre-update"
                            ? "warning"
                            : "info"
                        }
                        className="text-[10px]"
                      >
                        {backup.backup_type === "pre-update"
                          ? "UPDATE"
                          : "MANUAL"}
                      </Badge>
                      <span className="text-sm font-semibold">
                        {backup.display_title}
                      </span>
                    </div>
                    {backup.display_detail && (
                      <p className="text-sm text-muted-foreground">
                        {backup.display_detail}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(backup.created)}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() =>
                        setRenameDialog({ backup, value: backup.display_title })
                      }
                      title="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setConfirmDialog({ type: "restore", backup })
                      }
                    >
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        setConfirmDialog({ type: "delete", backup })
                      }
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>

      {/* Rename dialog */}
      <Dialog
        open={!!renameDialog}
        onOpenChange={(open) => !open && setRenameDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Backup</DialogTitle>
            <DialogDescription>
              Enter a new label for this backup.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <input
              type="text"
              value={renameDialog?.value ?? ""}
              onChange={(e) =>
                setRenameDialog((p) =>
                  p ? { ...p, value: e.target.value } : null
                )
              }
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              placeholder="Backup label"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const d = renameDialog;
                  if (d?.value.trim()) {
                    renameBackup.mutate(
                      { folderName: d.backup.folder_name, label: d.value.trim() },
                      { onSuccess: () => setRenameDialog(null) }
                    );
                  }
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const d = renameDialog;
                if (d?.value.trim()) {
                  renameBackup.mutate(
                    { folderName: d.backup.folder_name, label: d.value.trim() },
                    { onSuccess: () => setRenameDialog(null) }
                  );
                }
              }}
              disabled={!renameDialog?.value.trim() || renameBackup.isPending}
            >
              {renameBackup.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <Dialog
        open={!!confirmDialog}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog?.type === "restore"
                ? "Confirm Restore"
                : "Confirm Delete"}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog?.type === "restore"
                ? "This will replace your current server files with this backup. This action cannot be undone."
                : "This will permanently delete this backup. This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={
                confirmDialog?.type === "delete" ? "destructive" : "default"
              }
              onClick={handleConfirm}
            >
              {confirmDialog?.type === "restore" ? "Restore" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </div>
      </div>
    </div>
  );
}
