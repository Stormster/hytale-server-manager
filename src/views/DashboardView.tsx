import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/StatusBadge";
import { InfoRow } from "@/components/InfoRow";
import { InstallServerDialog } from "@/components/InstallServerDialog";
import { useServerStatus, useStartServer, useStopServer } from "@/api/hooks/useServer";
import { useInstances, useSetActiveInstance, useReorderInstances } from "@/api/hooks/useInstances";
import { useUpdaterLocalStatus } from "@/api/hooks/useUpdater";
import { useAppInfo } from "@/api/hooks/useInfo";
import { useManagerUpdate } from "@/api/hooks/useInfo";
import { useSettings } from "@/api/hooks/useSettings";
import { useQueryClient } from "@tanstack/react-query";
import type { ViewName } from "@/components/AppSidebar";
import { ExternalLink, Download, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardViewProps {
  onNavigate: (view: ViewName) => void;
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const { data: settings } = useSettings();
  const { data: instances } = useInstances();
  const { data: serverStatus } = useServerStatus();
  const { data: updaterStatus } = useUpdaterLocalStatus();
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

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDraggedIndex(null);
    setDragOverIndex(null);
    if (draggedIndex === null || !instances) return;
    const newOrder = [...instances];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(dropIndex, 0, removed);
    reorderInstances.mutate(newOrder.map((i) => i.name));
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
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

      {/* Instance blocks - one full block per server */}
      <div>
        <p className="mb-3 text-sm text-muted-foreground">
          Drag cards to reorder
        </p>
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
              const displayVersion = thisInstalled
                ? inst.version.startsWith("v")
                  ? inst.version
                  : `v${inst.version}`
                : null;
              const patchlineDisplay =
                inst.patchline.charAt(0).toUpperCase() + inst.patchline.slice(1);

              return (
                <Card
                  key={inst.name}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "group cursor-grab transition-shadow active:cursor-grabbing",
                    isActive && "ring-2 ring-primary",
                    draggedIndex === index && "opacity-50",
                    dragOverIndex === index &&
                      draggedIndex !== index &&
                      "ring-2 ring-primary ring-offset-2 ring-offset-background"
                  )}
                >
                  <CardContent className="space-y-3 pt-6">
                    {/* Header with grip and status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                        <div className="min-w-0 flex-1">
                          <p
                            className="line-clamp-3 text-base font-semibold leading-tight"
                            title={inst.name}
                          >
                            {inst.name}
                          </p>
                          {!isActive && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Click Select to manage
                            </p>
                          )}
                        </div>
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
                    <Separator />

                    {/* Instance info */}
                    <div className="space-y-2">
                      <InfoRow
                        label="Version"
                        value={displayVersion ?? "—"}
                      />
                      <InfoRow label="Channel" value={patchlineDisplay} />
                      <InfoRow
                        label="Java"
                        value={
                          appInfo
                            ? appInfo.java_ok
                              ? appInfo.java_version
                              : "Not found"
                            : "..."
                        }
                      />
                    </div>
                    <Separator />

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      {isActive ? (
                        <>
                          {thisInstalled ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => {
                                  startServer.mutate(undefined, {
                                    onSuccess: () => onNavigate("server"),
                                  });
                                }}
                                disabled={running}
                              >
                                Start Server
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => stopServer.mutate()}
                                disabled={!running}
                              >
                                Stop Server
                              </Button>
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
                          )}
                        </>
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
