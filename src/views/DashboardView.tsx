import { useState, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import type { Instance } from "@/api/types";
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

interface SortableInstanceCardProps {
  inst: Instance;
  activeInstance: string;
  running: boolean;
  runningInstances: Array<{ name: string; game_port?: number | null; uptime_seconds?: number | null; ram_mb?: number | null; cpu_percent?: number | null }>;
  serverStatus: { uptime_seconds?: number | null; ram_mb?: number | null; cpu_percent?: number | null; players?: number | null; last_exit_code?: number | null; last_exit_time?: string | null } | undefined;
  lastBackupAgo: string | null;
  backupStale: boolean;
  updateAvailable: boolean;
  onNavigate: (view: ViewName) => void;
  onRestart: (instanceName: string) => void;
  onCreateBackup: () => void;
  onOpenLogs: (name: string) => void;
  onInstall: () => void;
  onSelect: () => void;
  startServer: ReturnType<typeof useStartServer>;
  stopServer: ReturnType<typeof useStopServer>;
  createBackup: ReturnType<typeof useCreateBackup>;
}

function SortableInstanceCard({
  inst,
  activeInstance,
  running,
  runningInstances,
  serverStatus,
  lastBackupAgo,
  backupStale,
  updateAvailable,
  onNavigate,
  onRestart,
  onCreateBackup,
  onOpenLogs,
  onInstall,
  onSelect,
  startServer,
  stopServer,
  createBackup,
}: SortableInstanceCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useSortable({
    id: inst.name,
    transition: null,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: "none", // no animations on drag/drop
  };

  const isActive = inst.name === activeInstance;
  const thisInstalled = inst.installed;
  const thisRunning = runningInstances.some((r) => r.name === inst.name);
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
      ref={setNodeRef}
      style={style}
      className={cn(
        "group",
        isActive && "ring-2 ring-primary",
        isDragging && "opacity-50"
      )}
    >
      <CardContent className="space-y-3 pt-5">
        <div
          {...attributes}
          {...listeners}
          className="flex items-start justify-between gap-2 cursor-grab active:cursor-grabbing select-none"
          title="Drag to reorder"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="line-clamp-2 text-base font-semibold leading-tight" title={inst.name}>
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
          {thisInstalled && (
            <span className="text-xs text-muted-foreground/80" title="Game port · Nitrado WebServer port">
              Port {inst.game_port ?? 5520}
              {inst.webserver_port != null && (
                <> · Web {inst.webserver_port}</>
              )}
            </span>
          )}
          {isActive && updateAvailable && (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-400">
              Update available
            </span>
          )}
        </div>

        {(isActive || thisRunning) && thisInstalled && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {thisRunning ? (
              (() => {
                const runInfo = runningInstances.find((r) => r.name === inst.name);
                return (
                  <>
                    <span title="Uptime">
                      {formatUptime(runInfo?.uptime_seconds ?? serverStatus?.uptime_seconds ?? null)}
                    </span>
                    {(runInfo?.ram_mb ?? serverStatus?.ram_mb) != null && (
                      <span className="flex items-center gap-1" title="RAM">
                        <HardDrive className="h-3 w-3" />
                        {runInfo?.ram_mb ?? serverStatus?.ram_mb} MB
                      </span>
                    )}
                    {(runInfo?.cpu_percent ?? serverStatus?.cpu_percent) != null && (
                      <span className="flex items-center gap-1" title="CPU">
                        <Cpu className="h-3 w-3" />
                        {runInfo?.cpu_percent ?? serverStatus?.cpu_percent}%
                      </span>
                    )}
                    {serverStatus?.players != null ? (
                      <span className="flex items-center gap-1" title="Players">
                        <Users className="h-3 w-3" />
                        {serverStatus.players}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-muted-foreground/70" title="Player count from Nitrado Query. Ensure nitrado.query.web.read.basic is in ANONYMOUS (mods/Nitrado_WebServer/permissions.json)">
                        <Users className="h-3 w-3" />
                        —
                      </span>
                    )}
                  </>
                );
              })()
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

        {isActive && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Last backup:{" "}
            {lastBackupAgo ? (
              <span className={cn(backupStale && "text-amber-400")}>
                {lastBackupAgo}
                {backupStale && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 align-middle" />}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-400">
                Never <AlertTriangle className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {isActive ? (
            thisInstalled ? (
              <>
                <Button
                  size="sm"
                  onClick={() => {
                    if (thisRunning) stopServer.mutate(inst.name);
                    else startServer.mutate(inst.name, { onSuccess: () => onNavigate("server") });
                  }}
                  disabled={startServer.isPending || stopServer.isPending}
                >
                  {thisRunning ? "Stop" : "Start"}
                </Button>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onRestart(inst.name)} disabled={!thisRunning} title="Restart">
                    <RotateCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onCreateBackup} disabled={createBackup.isPending} title="Backup now">
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onOpenLogs(inst.name)} title="Open logs">
                    <FileText className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </>
            ) : (
              <Button size="sm" onClick={onInstall} className="gap-2">
                <Download className="h-4 w-4" />
                Install Server
              </Button>
            )
          ) : thisInstalled ? (
            thisRunning ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => stopServer.mutate(inst.name)}
                disabled={stopServer.isPending}
              >
                Stop
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={() => startServer.mutate(inst.name, { onSuccess: () => onNavigate("server") })}
                  disabled={startServer.isPending}
                >
                  Start
                </Button>
                <Button size="sm" variant="outline" onClick={onSelect}>
                  Select
                </Button>
              </>
            )
          ) : (
            <Button size="sm" variant="outline" onClick={onSelect}>
              Select
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function useDashboardSensors() {
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const dndSensors = useDashboardSensors();

  const running = serverStatus?.running ?? false;
  const activeInstance = settings?.active_instance || "None";
  const rootDir = (settings?.root_dir || "").replace(/[/\\]+$/, "");
  const lastBackup = backups?.[0];
  const lastBackupAgo = lastBackup?.created ? timeAgo(lastBackup.created) : null;
  const backupStale = lastBackup?.created ? isStale(lastBackup.created) : true;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id || !instances) return;
    const oldIndex = instances.findIndex((i) => i.name === active.id);
    const newIndex = instances.findIndex((i) => i.name === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = [...instances];
    const [removed] = newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, removed);
    reorderInstances.mutate(newOrder.map((i) => i.name));
  };

  const createBackup = useCreateBackup();

  const handleRestart = (instanceName: string) => {
    stopServer.mutate(instanceName, {
      onSuccess: () => {
        setTimeout(() => {
          startServer.mutate(instanceName, {
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
      <DndContext
        sensors={dndSensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveId(active.id as string)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={instances?.map((i) => i.name) ?? []}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {instances?.length ? (
              instances.map((inst) => (
                <SortableInstanceCard
                  key={inst.name}
                  inst={inst}
                  activeInstance={activeInstance}
                  running={running}
                  runningInstances={serverStatus?.running_instances ?? []}
                  serverStatus={serverStatus}
                  lastBackupAgo={lastBackupAgo}
                  backupStale={backupStale}
                  updateAvailable={!!checkUpdates.data?.update_available}
                  onNavigate={onNavigate}
                  onRestart={handleRestart}
                  onCreateBackup={() => createBackup.mutate()}
                  onOpenLogs={handleOpenLogs}
                  onInstall={() => setInstallOpen(true)}
                  onSelect={() => setActive.mutate(inst.name)}
                  startServer={startServer}
                  stopServer={stopServer}
                  createBackup={createBackup}
                />
              ))
            ) : (
              <Card className="col-span-full">
                <CardContent className="py-12 text-center text-muted-foreground">
                  No instances yet. Add or import one from the sidebar.
                </CardContent>
              </Card>
            )}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeId && instances ? (
            (() => {
              const inst = instances.find((i) => i.name === activeId);
              if (!inst) return null;
              const shortVersion = inst.installed
                ? (() => {
                    const m = inst.version.match(/v?(\d{4})\.(\d{2})\.(\d{2})/);
                    return m ? `v${m[2]}.${m[3]}.${m[1]}` : inst.version;
                  })()
                : null;
              const patchlineShort =
                inst.patchline.charAt(0).toUpperCase() + inst.patchline.slice(1);
              const statusVariant = !inst.installed ? "warning" : "neutral";
              return (
                <Card className="cursor-grabbing opacity-90 shadow-xl ring-2 ring-primary/50 rotate-2">
                  <CardContent className="space-y-3 pt-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <p className="line-clamp-2 text-base font-semibold leading-tight">
                          {inst.name}
                        </p>
                      </div>
                      <StatusBadge
                        text={!inst.installed ? "Not Installed" : "Stopped"}
                        variant={statusVariant}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm text-muted-foreground">
                        {shortVersion ?? "—"}
                        {inst.installed && (
                          <span className="ml-1 text-xs text-muted-foreground/80">
                            ({patchlineShort})
                          </span>
                        )}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })()
          ) : null}
        </DragOverlay>
      </DndContext>

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
