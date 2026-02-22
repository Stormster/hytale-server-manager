import { useState } from "react";
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
import { useCreateBackup } from "@/api/hooks/useBackups";
import { useAllInstancesUpdateStatus } from "@/api/hooks/useUpdater";
import { useAppInfo, usePublicIp } from "@/api/hooks/useInfo";
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
  FolderOpen,
  FolderInput,
  Plus,
  Copy,
  AlertTriangle,
  Cpu,
  HardDrive,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

interface DashboardViewProps {
  onNavigate: (view: ViewName) => void;
  onAddServer?: () => void;
  onImportServer?: () => void;
}

interface SortableInstanceCardProps {
  inst: Instance;
  activeInstance: string;
  running: boolean;
  runningInstances: Array<{ name: string; game_port?: number | null; uptime_seconds?: number | null; ram_mb?: number | null; cpu_percent?: number | null }>;
  serverStatus: { uptime_seconds?: number | null; ram_mb?: number | null; cpu_percent?: number | null; players?: number | null; last_exit_code?: number | null; last_exit_time?: string | null; update_in_progress?: string | null } | undefined;
  updateAvailable: boolean;
  hasUpdateStatus: boolean;
  onNavigate: (view: ViewName) => void;
  onRestart: (instanceName: string) => void;
  onCreateBackup: (instanceName: string) => void;
  onOpenFolder: (name: string) => void;
  onCopyIp?: (gamePort: number) => void;
  onInstall: () => void;
  onSelect: () => void;
  setActive: ReturnType<typeof useSetActiveInstance>;
  queryClient: ReturnType<typeof useQueryClient>;
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
  updateAvailable,
  hasUpdateStatus,
  onNavigate,
  onRestart,
  onCreateBackup,
  onOpenFolder,
  onCopyIp,
  onInstall,
  onSelect,
  setActive,
  queryClient,
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
        "group transition-colors",
        isActive && "ring-4 ring-ring bg-accent",
        !isActive && "cursor-pointer hover:bg-muted/50",
        isDragging && "opacity-50"
      )}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        if (!isActive) onSelect();
      }}
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if ((e.target as HTMLElement).closest("button")) return;
          if (!isActive) onSelect();
        }
      }}
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
            <span className="text-xs text-muted-foreground/80">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-default">Port {inst.game_port ?? 5520}</span>
                </TooltipTrigger>
                <TooltipContent>Game port</TooltipContent>
              </Tooltip>
              {inst.webserver_port != null && (
                <>
                  <span className="text-muted-foreground/60"> · </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-default">Web {inst.webserver_port}</span>
                    </TooltipTrigger>
                    <TooltipContent>Nitrado WebServer port</TooltipContent>
                  </Tooltip>
                </>
              )}
            </span>
          )}
        </div>

        {thisInstalled && (
          <div className="flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {(isActive || thisRunning) && serverStatus?.last_exit_code != null && serverStatus.last_exit_code !== 0 && !thisRunning ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-amber-400 cursor-default">
                    Crashed {serverStatus.last_exit_time ? timeAgo(serverStatus.last_exit_time) : "recently"}
                  </span>
                </TooltipTrigger>
                <TooltipContent>Last exit</TooltipContent>
              </Tooltip>
            ) : (
              (() => {
                const runInfo = runningInstances.find((r) => r.name === inst.name);
                // Only show stats for this instance when it's running—never use another instance's stats
                const uptime = thisRunning ? (runInfo?.uptime_seconds ?? null) : null;
                const ram = thisRunning ? (runInfo?.ram_mb ?? null) : null;
                const cpu = thisRunning ? (runInfo?.cpu_percent ?? null) : null;
                const players = thisRunning ? (serverStatus?.players ?? 0) : 0;
                return (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild><span className="cursor-default">{formatUptime(uptime)}</span></TooltipTrigger>
                      <TooltipContent>Uptime</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1 cursor-default">
                          <HardDrive className="h-3 w-3" />
                          {ram != null ? `${ram} MB` : "—"}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>RAM</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1 cursor-default">
                          <Cpu className="h-3 w-3" />
                          {cpu != null ? `${cpu}%` : "—"}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>CPU</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1 cursor-default">
                          <Users className="h-3 w-3" />
                          {thisRunning ? players : "—"}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Players</TooltipContent>
                    </Tooltip>
                  </>
                );
              })()
            )}
          </div>
        )}

        {thisInstalled && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Last backup:{" "}
            {inst.last_backup_created ? (
              (() => {
                const ago = timeAgo(inst.last_backup_created);
                const stale = isStale(inst.last_backup_created);
                return (
                  <span className={cn(stale && "text-amber-400")}>
                    {ago}
                    {stale && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 align-middle" />}
                  </span>
                );
              })()
            ) : (
              <span className="flex items-center gap-1 text-amber-400">
                Never <AlertTriangle className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {thisInstalled ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (thisRunning) {
                        stopServer.mutate(inst.name);
                      } else {
                        const doStart = () => {
                          startServer.mutate(inst.name, {
                            onSuccess: async () => {
                              await queryClient.refetchQueries({ queryKey: ["server", "status"] });
                              onNavigate("server");
                            },
                          });
                        };
                        if (inst.name !== activeInstance) {
                          setActive.mutate(inst.name, { onSuccess: doStart });
                        } else {
                          doStart();
                        }
                      }
                    }}
                    disabled={
                      startServer.isPending ||
                      stopServer.isPending ||
                      !!serverStatus?.update_in_progress
                    }
                  >
                    {thisRunning ? "Stop" : "Start"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {serverStatus?.update_in_progress
                    ? "Update in progress – cannot start"
                    : thisRunning
                      ? "Stop server"
                      : "Start server"}
                </TooltipContent>
              </Tooltip>
              <div className="flex flex-1 gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onRestart(inst.name)} disabled={!thisRunning}>
                      <RotateCw className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Restart</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onCreateBackup(inst.name)} disabled={createBackup.isPending}>
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Backup now</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onOpenFolder(inst.name)}>
                      <FolderOpen className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open in File Explorer</TooltipContent>
                </Tooltip>
                {thisRunning && onCopyIp && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => onCopyIp(runningInstances.find((r) => r.name === inst.name)?.game_port ?? inst.game_port ?? 5520)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy public IP and port</TooltipContent>
                  </Tooltip>
                )}
              </div>
              {hasUpdateStatus && (
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
                    updateAvailable
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-emerald-500/20 text-emerald-400"
                  )}
                >
                  {updateAvailable ? "Update available" : "Up to date"}
                </span>
              )}
            </>
          ) : (
            <>
              <Button size="sm" onClick={onInstall} className="gap-2">
                <Download className="h-4 w-4" />
                Install Server
              </Button>
            </>
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

export function DashboardView({ onNavigate, onAddServer, onImportServer }: DashboardViewProps) {
  const { data: settings } = useSettings();
  const { data: instances } = useInstances();
  const { data: serverStatus } = useServerStatus();
  const { data: allUpdateStatus } = useAllInstancesUpdateStatus();
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
  const { data: publicIpData } = usePublicIp(running);

  const handleCopyIp = async (gamePort: number) => {
    const ip = publicIpData?.ip;
    if (!ip) return;
    const text = `${ip}:${gamePort}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("IP copied to clipboard");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast.success("IP copied to clipboard");
    }
  };

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

  const handleCreateBackup = (instanceName: string) => {
    const doBackup = () => createBackup.mutate(undefined);
    if (instanceName !== activeInstance) {
      setActive.mutate(instanceName, {
        onSuccess: () => doBackup(),
      });
    } else {
      doBackup();
    }
  };

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

  const handleOpenFolder = async (instanceName: string) => {
    if (!rootDir) return;
    const sep = rootDir.includes("\\") ? "\\" : "/";
    const path = [rootDir.replace(/[/\\]+$/, ""), instanceName].join(sep);
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
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 px-6 py-8 sm:px-6">
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
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 hover:underline"
            >
              View release <ExternalLink className="h-3 w-3 shrink-0" />
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
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {instances?.length ? (
              instances.map((inst) => (
                <SortableInstanceCard
                  key={inst.name}
                  inst={inst}
                  activeInstance={activeInstance}
                  running={running}
                  runningInstances={serverStatus?.running_instances ?? []}
                  serverStatus={serverStatus}
                  updateAvailable={!!allUpdateStatus?.instances?.[inst.name]?.update_available}
                  hasUpdateStatus={!!(inst.installed && allUpdateStatus?.instances?.[inst.name])}
                  onNavigate={onNavigate}
                  onRestart={handleRestart}
                  onCreateBackup={handleCreateBackup}
                  onOpenFolder={handleOpenFolder}
                  onCopyIp={handleCopyIp}
                  onInstall={() => setInstallOpen(true)}
                  onSelect={() => setActive.mutate(inst.name)}
                  setActive={setActive}
                  queryClient={queryClient}
                  startServer={startServer}
                  stopServer={stopServer}
                  createBackup={createBackup}
                />
              ))
            ) : (
              <Card className="col-span-full">
                <CardContent className="py-12 text-center">
                  <p className="mb-6 text-muted-foreground">
                    No instances yet.
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button onClick={onAddServer} className="gap-2">
                      <Plus className="h-4 w-4" />
                      Add new
                    </Button>
                    <Button
                      variant="outline"
                      onClick={onImportServer}
                      className="gap-2"
                    >
                      <FolderInput className="h-4 w-4" />
                      Import existing
                    </Button>
                  </div>
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
          queryClient.invalidateQueries({ queryKey: ["instances"] });
          queryClient.invalidateQueries({ queryKey: ["updater", "all-instances"] });
          queryClient.invalidateQueries({ queryKey: ["updater", "local-status"] });
          queryClient.invalidateQueries({ queryKey: ["server", "status"] });
        }}
      />

      <p className="text-xs text-muted-foreground">
        <a
          href="https://github.com/Stormster/hytale-server-manager/issues"
          target="_blank"
          rel="noreferrer"
          className="text-foreground hover:underline"
        >
          Report issues on GitHub
        </a>
      </p>
        </div>
      </div>
    </div>
  );
}
