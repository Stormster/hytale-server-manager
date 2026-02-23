import { useState, useEffect } from "react";
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
  useHytaleWorldBackups,
  useCreateBackup,
  useRestoreBackup,
  useRenameBackup,
  useDeleteBackup,
} from "@/api/hooks/useBackups";
import { useSettings } from "@/api/hooks/useSettings";
import type { Backup } from "@/api/types";
import { Pencil, FolderOpen, ChevronDown, ChevronUp, Info } from "lucide-react";
import { api } from "@/api/client";
import type { ViewName } from "@/components/AppSidebar";

interface BackupViewProps {
  onNavigate?: (view: ViewName) => void;
}

function isHytaleBackupEnabled(settings: { instance_server_settings?: Record<string, { startup_args?: string[] }> } | undefined, activeInstance: string): boolean {
  const all = settings?.instance_server_settings ?? {};
  const hasExplicitSettings = Boolean(activeInstance && activeInstance in all);
  const args = all[activeInstance]?.startup_args ?? [];
  // Only default to enabled when instance has never been configured
  if (!hasExplicitSettings && args.length === 0) return true;
  const hasBackup = args.includes("--backup");
  const backupDirIdx = args.indexOf("--backup-dir");
  const hasBackupDir = backupDirIdx >= 0 && backupDirIdx + 1 < args.length && args[backupDirIdx + 1]?.trim() !== "";
  return hasBackup && hasBackupDir;
}

export function BackupView({ onNavigate }: BackupViewProps) {
  const { data: settings, refetch: refetchSettings } = useSettings();
  const activeInstance = settings?.active_instance ?? "";
  const hytaleBackupEnabled = isHytaleBackupEnabled(settings, activeInstance);

  // Refetch settings on mount so we have latest backup config after returning from Configuration
  useEffect(() => {
    refetchSettings();
  }, [refetchSettings]);
  const { data: backups, isLoading } = useBackups();
  const { data: worldSnapshots, isLoading: worldLoading } = useHytaleWorldBackups();
  const createBackup = useCreateBackup();
  const restoreBackup = useRestoreBackup();
  const renameBackup = useRenameBackup();
  const deleteBackup = useDeleteBackup();

  const [showExplainer, setShowExplainer] = useState(false);
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

  const handleOpenWorldSnapshotsFolder = async () => {
    try {
      const { path } = await api<{ path: string }>("/api/backups/world-snapshots-folder");
      const { openPathInExplorer } = await import("@/lib/openPath");
      await openPathInExplorer(path);
    } catch {
      // ignore
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Backups</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Server snapshots and Hytale world backups. Create full backups or use automatic universe snapshots.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button
            onClick={() => createBackup.mutate(undefined)}
            disabled={createBackup.isPending}
          >
            {createBackup.isPending ? "Creating..." : "Create Backup"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-auto gap-1.5 py-1 px-0 text-muted-foreground hover:text-foreground"
            onClick={() => setShowExplainer((v) => !v)}
          >
            {showExplainer ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            What are backups?
          </Button>
        </div>
      </div>

      {showExplainer && (
        <Card className="border-muted/50 bg-muted/20">
          <CardContent className="flex gap-4 py-4">
            <Info className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
            <div className="min-w-0 space-y-2 text-sm">
              <p className="font-medium text-foreground">What are backups?</p>
              <p className="text-muted-foreground leading-relaxed">
                Two types of backups protect your server:
              </p>
              <ul className="space-y-1.5 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span><strong className="text-foreground">Server snapshots</strong> — Full instance backups (Server folder, Assets.zip, config). Use &quot;Create Backup&quot; or created automatically before updates. Stored in <code className="text-xs">instance/backups/</code>.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span><strong className="text-foreground">World snapshots</strong> — Hytale universe backups from <code className="text-xs">--backup</code> and <code className="text-xs">/backup</code>. Stored in <code className="text-xs">Server/backups/</code>. Requires <code className="text-xs">--backup-dir</code> in Configuration. Restore by extracting the .zip and replacing <code className="text-xs">Server/universe/</code> (stop server first).</span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* World Snapshots */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">World Snapshots</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            onClick={handleOpenWorldSnapshotsFolder}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Open folder
          </Button>
        </div>
        {worldLoading ? (
          <p className="text-xs text-muted-foreground">Loading...</p>
        ) : worldSnapshots && worldSnapshots.length > 0 ? (
          <div className="space-y-3">
            {worldSnapshots.slice(0, 15).map((s) => (
              <Card key={s.path}>
                <CardContent className="py-4 px-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant="secondary"
                          className="text-[10px]"
                        >
                          {s.archived ? "ARCHIVED" : "WORLDS"}
                        </Badge>
                        <span className="text-sm font-semibold font-mono">
                          {s.filename}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {s.created ? formatDate(s.created) : "—"} · {formatSize(s.size_bytes)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {worldSnapshots.length > 15 && (
              <p className="text-xs text-muted-foreground px-1">+{worldSnapshots.length - 15} more</p>
            )}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center">
              <p className="text-sm font-medium text-foreground">No world snapshots</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {hytaleBackupEnabled ? (
                  <>Snapshots are created automatically (every 30 min by default) or use <code className="rounded bg-muted px-1 font-mono text-xs">/backup</code> in the console.</>
                ) : (
                  <>
                    Enable in{" "}
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate?.("config");
                        setTimeout(() => document.getElementById("backup-settings")?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
                      }}
                      className="text-blue-400 hover:text-blue-300 hover:underline font-medium"
                    >
                      Configuration
                    </button>
                    {" "}and set <code className="rounded bg-muted px-1 font-mono text-xs">--backup-dir</code>.
                  </>
                )}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Server Snapshots */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Server Snapshots</h3>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-3 pr-4">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : !backups || backups.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-6 text-center">
                <p className="text-sm font-medium text-foreground">No server snapshots</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create one to get started using the Create Backup button above.
                </p>
              </CardContent>
            </Card>
          ) : (
            backups.map((backup) => (
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
            ))
          )}
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
