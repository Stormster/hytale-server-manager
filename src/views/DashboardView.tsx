import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InstallServerDialog } from "@/components/InstallServerDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { useServerStatus, useStartServer, useStopServer } from "@/api/hooks/useServer";
import { useInstances, useSetActiveInstance, useReorderInstances } from "@/api/hooks/useInstances";
import { useBackups, useCreateBackup } from "@/api/hooks/useBackups";
import { useCheckUpdates } from "@/api/hooks/useUpdater";
import { useAppInfo } from "@/api/hooks/useInfo";
import { useManagerUpdate } from "@/api/hooks/useInfo";
import { useSettings } from "@/api/hooks/useSettings";
import { useQueryClient } from "@tanstack/react-query";
import type { ViewName } from "@/components/AppSidebar";
import { timeAgo, isStale, formatUptime } from "@/lib/timeAgo";
import {
  ExternalLink,
  Download,
  GripVertical,
  RotateCw,
  Archive,
  FileText,
  AlertTriangle,
  Cpu,
  HardDrive,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardViewProps {
  onNavigate: (view: ViewName) => void;
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const { data: settings } = useSettings();
  const { data: instances } = useInstances();
  const { data: serverStatus } = useServerStatus();
  const { data: backups } = useBackups();
  const checkUpdates = useCheckUpdates();
  const { data: appInfo } = useAppInfo();
  const { data: managerUpdate } = useManagerUpdate();
  const startServer = useStartServer();
  const stopServer = useStopServer();
  const setActive = useSetActiveInstance();
  const reorderInstances = useReorderInstances();
  const queryClient = useQueryClient();
  const [installOpen, setInstallOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const running = serverStatus?.running ?? false;
  const activeInstance = settings?.active_instance || "None";
  const rootDir = (settings?.root_dir || "").replace(/[/\\]+$/, "");
  const lastBackup = backups?.[0];
  const lastBackupAgo = lastBackup?.created ? timeAgo(lastBackup.created) : null;
  const backupStale = lastBackup?.created ? isStale(lastBackup.created) : true;

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
    e.dataTransfer.setData("application/json", JSON.stringify({ index }));
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverIndex(null);
    }
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const raw = e.dataTransfer.getData("text/plain");
    const sourceIndex = raw ? parseInt(raw, 10) : draggedIndex;
    setDraggedIndex(null);
    setDragOverIndex(null);
    if (sourceIndex === undefined || sourceIndex < 0 || !instances) return;
    const newOrder = [...instances];
    const [removed] = newOrder.splice(sourceIndex, 1);
    newOrder.splice(dropIndex, 0, removed);
    reorderInstances.mutate(newOrder.map((i) => i.name));
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const createBackup = useCreateBackup();

  const handleRestart = () => {
    stopServer.mutate(undefined, {
      onSuccess: () => {
        setTimeout(() => {
          startServer.mutate(undefined, {
            onSuccess: () => onNavigate("server"),
          });
        }, 1500);
      },
    });
  };

  useEffect(() => {
    if (activeInstance && serverStatus?.installed) {
      checkUpdates.mutate();
    }
  }, [activeInstance, serverStatus?.installed]);

  const handleOpenLogs = async (instanceName: string) => {
    if (!rootDir) return;
    const sep = rootDir.includes("\\") ? "\\" : "/";
    const path = [rootDir.replace(/[/\\]+$/, ""), instanceName, "Server", "logs"].join(sep);
    try {
      const { api } = await import("@/api/client");
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

  return (
    <div className="min-h-full space-y-6 p-4 sm:p-6">
      {/* Manager update banner */}
      {managerUpdate?.update_available && (
        <div className="flex flex-col gap-2 rounded-lg border bg-accent/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            Manager v{managerUpdate.latest_version} is available (current:
            v{appInfo?.manager_version})
          </p>
          {managerUpdate.download_url && (
            <a
              href={managerUpdate.download_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex gap-1 text-sm font-medium text-blue-400 hover:underline"
            >
              View release <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      <h2 className="text-xl font-bold">Dashboard</h2>

      {/* Instance blocks */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {instances?.length ? (
          instances.map((inst, index) => {
            const isActive = inst.name === activeInstance;
            const thisInstalled = inst.installed;
            const thisRunning = isActive && running;
            const statusVariant = !thisInstalled
              ? "warning"
              : thisRunning
                ? "ok"
                : "neutral";
            const shortVersion = thisInstalled
              ? (() => {
                  const m = inst.version.match(/v?(\d{4})\.(\d{2})\.(\d{2})/);
                  return m ? `v${m[2]}.${m[3]}.${m[1]}` : inst.version;
                })()
              : null;
            const patchlineShort =
              inst.patchline.charAt(0).toUpperCase() + inst.patchline.slice(1);
            return (
              <Card
                key={inst.name}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                className={cn(
                  "group transition-shadow",
                  isActive && "ring-2 ring-primary",
                  draggedIndex === index && "opacity-50",
                  dragOverIndex === index &&
                    draggedIndex !== index &&
                    "ring-2 ring-primary ring-offset-2 ring-offset-background"
                )}
              >
                <CardContent className="space-y-3 pt-5">
                  {/* Header: name + status + grip (draggable) */}
                  <div
                    className="flex items-start justify-between gap-2 cursor-grab active:cursor-grabbing select-none"
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnd={handleDragEnd}
                    title="Drag to reorder"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <p
                        className="line-clamp-2 text-base font-semibold leading-tight"
                        title={inst.name}
                      >
                        {inst.name}
                      </p>
                    </div>
                    <StatusBadge
                      text={
                        !thisInstalled
                          ? "Not Installed"
                          : thisRunning
                            ? "Running"
                            : "Stopped"
                      }
                      variant={statusVariant}
                    />
                  </div>

                  {/* Version + update */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span
                      className="text-sm text-muted-foreground"
                      title={thisInstalled ? inst.version : undefined}
                    >
                      {shortVersion ?? "—"}
                      {thisInstalled && (
                        <span className="ml-1 text-xs text-muted-foreground/80">
                          ({patchlineShort})
                        </span>
                      )}
                    </span>
                    {isActive &&
                      checkUpdates.data?.update_available && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-400">
                          Update available
                        </span>
                      )}
                  </div>

                  {/* Metrics: uptime, crashed, RAM, CPU, players */}
                  {isActive && thisInstalled && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {thisRunning ? (
                        <>
                          <span title="Uptime">
                            {formatUptime(serverStatus?.uptime_seconds ?? null)}
                          </span>
                          {serverStatus?.ram_mb != null && (
                            <span className="flex items-center gap-1" title="RAM">
                              <HardDrive className="h-3 w-3" />
                              {serverStatus.ram_mb} MB
                            </span>
                          )}
                          {serverStatus?.cpu_percent != null && (
                            <span className="flex items-center gap-1" title="CPU">
                              <Cpu className="h-3 w-3" />
                              {serverStatus.cpu_percent}%
                            </span>
                          )}
                          {serverStatus?.players != null ? (
                            <span className="flex items-center gap-1" title="Players">
                              <Users className="h-3 w-3" />
                              {serverStatus.players}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-muted-foreground/70" title="Player count requires a query plugin (e.g. Nitrado)">
                              <Users className="h-3 w-3" />
                              —
                            </span>
                          )}
                        </>
                      ) : (
                        serverStatus?.last_exit_code != null &&
                        serverStatus.last_exit_code !== 0 && (
                          <span className="text-amber-400" title="Last exit">
                            Crashed {serverStatus.last_exit_time ? timeAgo(serverStatus.last_exit_time) : "recently"}
                          </span>
                        )
                      )}
                    </div>
                  )}

                  {/* Last backup */}
                  {isActive && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      Last backup:{" "}
                      {lastBackupAgo ? (
                        <span className={cn(backupStale && "text-amber-400")}>
                          {lastBackupAgo}
                          {backupStale && (
                            <AlertTriangle className="ml-1 inline h-3.5 w-3.5 align-middle" />
                          )}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-400">
                          Never <AlertTriangle className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {isActive ? (
                      thisInstalled ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => {
                              if (running) {
                                stopServer.mutate();
                              } else {
                                startServer.mutate(undefined, {
                                  onSuccess: () => onNavigate("server"),
                                });
                              }
                            }}
                            disabled={startServer.isPending || stopServer.isPending}
                          >
                            {running ? "Stop" : "Start"}
                          </Button>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={handleRestart}
                              disabled={!running}
                              title="Restart"
                            >
                              <RotateCw className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => createBackup.mutate()}
                              disabled={createBackup.isPending}
                              title="Backup now"
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => handleOpenLogs(inst.name)}
                              title="Open logs"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => setInstallOpen(true)}
                          className="gap-2"
                        >
                          <Download className="h-4 w-4" />
                          Install Server
                        </Button>
                      )
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setActive.mutate(inst.name)}
                      >
                        Select
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center text-muted-foreground">
              No instances yet. Add or import one from the sidebar.
            </CardContent>
          </Card>
        )}
      </div>

      <InstallServerDialog
        open={installOpen}
        onOpenChange={setInstallOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["server", "status"] });
          queryClient.invalidateQueries({ queryKey: ["updater", "local-status"] });
        }}
      />

      <p className="text-xs text-muted-foreground">
        Report issues:{" "}
        <a
          href={appInfo?.report_url ?? "https://HytaleManager.com/issues"}
          target="_blank"
          rel="noreferrer"
          className="text-foreground hover:underline"
        >
          {appInfo?.report_url ?? "https://HytaleManager.com/issues"}
        </a>
      </p>
    </div>
  );
}
