import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { InfoRow } from "@/components/InfoRow";
import { InstallServerDialog } from "@/components/InstallServerDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useUpdaterLocalStatus, useAllInstancesUpdateStatus } from "@/api/hooks/useUpdater";
import { useSettings, useUpdateSettings } from "@/api/hooks/useSettings";
import { useInstances } from "@/api/hooks/useInstances";
import { useServerStatus } from "@/api/hooks/useServer";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeSSE } from "@/api/client";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function UpdateView() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { data: instances } = useInstances();
  const queryClient = useQueryClient();

  const refreshOnUpdateComplete = useCallback(() => {
    const p = queryClient.refetchQueries({ queryKey: ["updater", "all-instances"] });
    queryClient.refetchQueries({ queryKey: ["instances"] });
    queryClient.refetchQueries({ queryKey: ["updater", "local-status"] });
    queryClient.refetchQueries({ queryKey: ["server", "status"] });
    return p;
  }, [queryClient]);
  const [installOpen, setInstallOpen] = useState(false);
  const { data: localStatus } = useUpdaterLocalStatus();
  const { data: allUpdateStatus, isLoading: checkingUpdates, refetch: refetchUpdates } = useAllInstancesUpdateStatus();

  const activeInstance = settings?.active_instance || "None";
  const activeStatus = activeInstance !== "None" ? allUpdateStatus?.instances?.[activeInstance] : undefined;
  const rr = allUpdateStatus?.remote_release ?? null;
  const rp = allUpdateStatus?.remote_prerelease ?? null;
  const updateAvailable = activeStatus?.update_available ?? false;
  const hasStatus = !!allUpdateStatus;

  const instancesWithUpdates = hasStatus
    ? Object.entries(allUpdateStatus?.instances ?? {}).filter(([, info]) => info.update_available)
    : [];

  const { data: serverStatus } = useServerStatus();
  const runningInstanceNames = new Set(
    serverStatus?.running_instances?.map((r) => r.name) ?? []
  );
  /** True if the active instance (being updated) is running */
  const activeInstanceRunning =
    activeInstance !== "None" && runningInstanceNames.has(activeInstance);
  /** Instances with updates that are currently running (for Update all dialog) */
  const instancesToUpdateRunning = instancesWithUpdates.filter(([name]) =>
    runningInstanceNames.has(name)
  );
  const runningCountForUpdateAll = instancesToUpdateRunning.length;
  const backgroundUpdateInProgress = !!serverStatus?.update_in_progress;

  const [shutdownConfirmOpen, setShutdownConfirmOpen] = useState(false);
  const [updateLeaveWarningOpen, setUpdateLeaveWarningOpen] = useState(false);
  const [updateLeaveDontShow, setUpdateLeaveDontShow] = useState(false);
  const [updateCurrentChoiceOpen, setUpdateCurrentChoiceOpen] = useState(false);
  const [pendingUpdateCurrentPatchline, setPendingUpdateCurrentPatchline] = useState<string>("release");
  const [pendingUpdate, setPendingUpdate] = useState<{
    type: "current";
    patchline: string;
    graceful?: boolean;
  } | { type: "all"; graceful?: boolean } | null>(null);

  const SKIP_UPDATE_LEAVE_KEY = "hytale-manager:skipUpdateLeaveWarning";


  // Update progress state
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const [progressDetail, setProgressDetail] = useState("");
  const [updateDone, setUpdateDone] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleRefresh = () => {
    setUpdateDone(null);
    refetchUpdates();
  };

  const doUpdateActual = useCallback((patchline: string, graceful = false) => {
    setUpdating(true);
    setProgress(0);
    setProgressStatus("Preparing...");
    setProgressDetail("");
    setUpdateDone(null);

    subscribeSSE(
      `/api/updater/update?patchline=${patchline}`,
      {
        onEvent(event, data) {
          const d = data as Record<string, unknown>;
          if (event === "status") {
            if (mountedRef.current) setProgressStatus(d.message as string);
          } else if (event === "progress") {
            if (mountedRef.current) {
              setProgress(d.percent as number);
              setProgressDetail(d.detail as string);
            }
          } else if (event === "done") {
            const ok = d.ok as boolean;
            const msg = d.message as string;
            if (mountedRef.current) {
              setUpdateDone({ ok, message: msg });
              setUpdating(false);
              if (ok) setProgress(100);
            }
            // Always run these so they work when user navigated away (background update)
            if (ok) {
              refreshOnUpdateComplete().then(() => {
                if (mountedRef.current) setUpdateDone(null);
              });
              toast.success("Server update completed");
            } else {
              toast.error(msg || "Update failed");
            }
          }
        },
        onError() {
          if (mountedRef.current) {
            setUpdateDone({ ok: false, message: "Connection error" });
            setUpdating(false);
          }
          toast.error("Connection error");
        },
      },
      { method: "POST", body: JSON.stringify({ graceful }) }
    );
  }, [refreshOnUpdateComplete]);

  const doUpdate = doUpdateActual;


  const runUpdateAll = useCallback((graceful = false) => {
    setShutdownConfirmOpen(false);
    setUpdating(true);
    setProgress(0);
    setProgressStatus("Preparing...");
    setProgressDetail("");
    setUpdateDone(null);

    subscribeSSE("/api/updater/update-all", {
      onEvent(event, data) {
        const d = data as Record<string, unknown>;
        if (event === "status") {
          if (mountedRef.current) setProgressStatus(d.message as string);
        } else if (event === "progress") {
          if (mountedRef.current) {
            setProgress(d.percent as number);
            setProgressDetail(d.detail as string);
          }
        } else if (event === "done") {
          const ok = d.ok as boolean;
          const msg = d.message as string;
          if (mountedRef.current) {
            setUpdateDone({ ok, message: msg });
            setUpdating(false);
            if (ok) setProgress(100);
          }
          if (ok) {
            refreshOnUpdateComplete().then(() => {
              if (mountedRef.current) setUpdateDone(null);
            });
            toast.success("Update all completed");
          } else {
            toast.error(msg || "Update failed");
          }
        }
      },
      onError() {
        if (mountedRef.current) {
          setUpdateDone({ ok: false, message: "Connection error" });
          setUpdating(false);
        }
        toast.error("Connection error");
      },
    }, { method: "POST", body: JSON.stringify({ graceful }) });
  }, [refreshOnUpdateComplete]);

  const confirmAndRunUpdate = useCallback(
    (update: { type: "current"; patchline: string; graceful?: boolean } | { type: "all"; graceful?: boolean }) => {
      if (typeof localStorage !== "undefined" && localStorage.getItem(SKIP_UPDATE_LEAVE_KEY)) {
        if (update.type === "current") {
          doUpdateActual(update.patchline, update.graceful ?? false);
        } else {
          runUpdateAll(update.graceful ?? false);
        }
        return;
      }
      setPendingUpdate(update);
      setUpdateLeaveWarningOpen(true);
    },
    [doUpdateActual, runUpdateAll]
  );

  const handleUpdateLeaveContinue = useCallback(() => {
    if (updateLeaveDontShow && typeof localStorage !== "undefined") {
      localStorage.setItem(SKIP_UPDATE_LEAVE_KEY, "1");
    }
    setUpdateLeaveWarningOpen(false);
    setUpdateLeaveDontShow(false);
    if (pendingUpdate) {
      if (pendingUpdate.type === "current") {
        doUpdateActual(pendingUpdate.patchline, pendingUpdate.graceful ?? false);
      } else {
        runUpdateAll(pendingUpdate.graceful ?? false);
      }
      setPendingUpdate(null);
    }
  }, [pendingUpdate, updateLeaveDontShow, doUpdateActual, runUpdateAll]);

  const doUpdateAll = useCallback(() => {
    if (runningCountForUpdateAll > 0) {
      setShutdownConfirmOpen(true);
      return;
    }
    confirmAndRunUpdate({ type: "all" });
  }, [runningCountForUpdateAll, confirmAndRunUpdate]);

  const handleUpdateChoice = useCallback(
    (graceful: boolean) => {
      setShutdownConfirmOpen(false);
      confirmAndRunUpdate({ type: "all", graceful });
    },
    [confirmAndRunUpdate]
  );

  const handleUpdateCurrentChoice = useCallback(
    (patchline: string, graceful: boolean) => {
      setUpdateCurrentChoiceOpen(false);
      confirmAndRunUpdate({ type: "current", patchline, graceful });
    },
    [confirmAndRunUpdate]
  );

  const iv = localStatus?.installed_version ?? "...";
  const ip = localStatus?.installed_patchline ?? "release";
  const notInstalled = iv === "unknown" || iv === "...";

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Server Updates</h2>
        <Button
          onClick={handleRefresh}
          disabled={checkingUpdates || updating}
        >
          {checkingUpdates ? "Checking..." : "Refresh"}
        </Button>
      </div>

      {/* Not installed: offer Install Server */}
      {notInstalled && activeInstance !== "None" && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              No server is installed for this instance. Install the Hytale
              server to check for updates.
            </p>
            <Button
              onClick={() => setInstallOpen(true)}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Install Server
            </Button>
          </CardContent>
        </Card>
      )}

      <InstallServerDialog
        open={installOpen}
        onOpenChange={setInstallOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["instances"] });
          queryClient.invalidateQueries({ queryKey: ["server", "status"] });
          queryClient.invalidateQueries({ queryKey: ["updater", "local-status"] });
          queryClient.invalidateQueries({ queryKey: ["updater", "all-instances"] });
        }}
      />

      {/* Version info and update actions - only when server is installed */}
      {!notInstalled && (
        <>
      {/* Version info card */}
      <Card>
        <CardContent className="pt-6 space-y-2">
          <InfoRow label="Installed version" value={iv} />
          <InfoRow
            label="Channel"
            value={ip.replace(/^\w/, (c) => c.toUpperCase())}
          />
          <Separator className="my-3" />
          <InfoRow
            label="Latest release"
            value={rr ?? (hasStatus ? "unavailable" : "--")}
          />
          <InfoRow
            label="Latest pre-release"
            value={rp ?? (hasStatus ? "unavailable" : "--")}
          />
        </CardContent>
      </Card>

      {/* Action card - update on current channel */}
      {hasStatus && !updating && !updateDone && !backgroundUpdateInProgress && (
        <Card
          className={
            !updateAvailable && instancesWithUpdates.length === 0
              ? "border-emerald-500/50 bg-emerald-500/10"
              : undefined
          }
        >
          <CardContent className="pt-6 space-y-4">
            {updateAvailable ? (
              <>
                <div>
                  <p className="font-semibold">New {ip} version available</p>
                  <p className="text-sm text-muted-foreground">
                    {iv} → {ip === "release" ? rr : rp}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      if (activeInstanceRunning) {
                        setPendingUpdateCurrentPatchline(ip);
                        setUpdateCurrentChoiceOpen(true);
                      } else {
                        confirmAndRunUpdate({ type: "current", patchline: ip });
                      }
                    }}
                    disabled={updating}
                  >
                    Update current
                  </Button>
                  {instancesWithUpdates.length > 0 && (
                    <>
                      <Button
                        variant="outline"
                        onClick={doUpdateAll}
                        disabled={checkingUpdates || updating}
                        className="gap-2"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Update all ({instancesWithUpdates.length})
                      </Button>
                      <ul className="w-full space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3 text-sm">
                        {instancesWithUpdates.map(([name, info]) => {
                          const targetVer =
                            info.installed_patchline === "release" ? rr : rp;
                          const channel =
                            info.installed_patchline === "release"
                              ? "Release"
                              : "Pre-release";
                          return (
                            <li key={name} className="flex flex-col gap-0.5">
                              <span className="font-medium">{name}</span>
                              <span className="text-muted-foreground">
                                {channel}: {info.installed_version} → {targetVer ?? "?"}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              </>
            ) : instancesWithUpdates.length > 0 ? (
              <div className="space-y-3">
                <p className="font-semibold">
                  {instancesWithUpdates.length} instance(s) have updates available
                </p>
                <ul className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3">
                  {instancesWithUpdates.map(([name, info]) => {
                    const targetVer =
                      info.installed_patchline === "release" ? rr : rp;
                    const channel =
                      info.installed_patchline === "release"
                        ? "Release"
                        : "Pre-release";
                    return (
                      <li
                        key={name}
                        className="flex flex-col gap-0.5 text-sm"
                      >
                        <span className="font-medium">{name}</span>
                        <span className="text-muted-foreground">
                          {channel}: {info.installed_version} → {targetVer ?? "?"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <Button
                  onClick={doUpdateAll}
                  disabled={checkingUpdates || updating}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Update all ({instancesWithUpdates.length})
                </Button>
              </div>
            ) : (
              <p className="text-sm font-semibold text-emerald-400">
                All servers are up to date.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Leave-page warning before starting update */}
      <Dialog
        open={updateLeaveWarningOpen}
        onOpenChange={(open) => {
          setUpdateLeaveWarningOpen(open);
          if (!open) {
            setPendingUpdate(null);
            setUpdateLeaveDontShow(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Starting update</DialogTitle>
            <DialogDescription asChild>
              <p className="text-sm text-muted-foreground">
                You can leave this page during the download and install. You&apos;ll get a
                notification when it completes. It&apos;s recommended not to make any changes to your
                servers until the process finishes.
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 py-2">
            <input
              id="update-leave-dont-show"
              type="checkbox"
              checked={updateLeaveDontShow}
              onChange={(e) => setUpdateLeaveDontShow(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-2 border-white/70 bg-transparent accent-white focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-background"
            />
            <Label htmlFor="update-leave-dont-show" className="cursor-pointer text-sm">
              Don&apos;t show this again
            </Label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateLeaveWarningOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateLeaveContinue}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shutdown confirmation when servers running - update all */}
      <Dialog open={shutdownConfirmOpen} onOpenChange={setShutdownConfirmOpen}>
        <DialogContent className="w-fit max-w-[min(32rem,90vw)]">
          <DialogHeader>
            <DialogTitle>Servers are running</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {runningCountForUpdateAll} {runningCountForUpdateAll === 1 ? "server is" : "servers are"} currently running. How would
                  you like to proceed?
                </p>
                <p className="text-xs">
                  <strong>Graceful:</strong> Notifies players in-game (1 min, 30s, 10s warnings), then shuts down—giving them time to save and disconnect safely.
                </p>
                <p className="text-xs">
                  <strong>Update now:</strong> Stops immediately. Use only when no players are online.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col items-stretch gap-3 pt-2 sm:flex-col">
            <div className="flex flex-nowrap gap-2">
              <Button variant="outline" onClick={() => handleUpdateChoice(false)}>
                Update now (stop immediately)
              </Button>
              <Button onClick={() => handleUpdateChoice(true)}>
                Graceful update (1 min warning)
              </Button>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setShutdownConfirmOpen(false)}>
                Cancel
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update current choice when server running */}
      <Dialog
        open={updateCurrentChoiceOpen}
        onOpenChange={(open) => {
          setUpdateCurrentChoiceOpen(open);
          if (!open) setPendingUpdateCurrentPatchline("release");
        }}
      >
        <DialogContent className="w-fit max-w-[min(32rem,90vw)]">
          <DialogHeader>
            <DialogTitle>Server is running</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>The current server is running. How would you like to proceed?</p>
                <p className="text-xs">
                  <strong>Graceful:</strong> Notifies players in-game (1 min, 30s, 10s warnings), then shuts down—giving them time to save and disconnect safely.
                </p>
                <p className="text-xs">
                  <strong>Update now:</strong> Stops immediately. Use only when no players are online.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col items-stretch gap-3 pt-2 sm:flex-col">
            <div className="flex flex-nowrap gap-2">
              <Button
                variant="outline"
                onClick={() => handleUpdateCurrentChoice(pendingUpdateCurrentPatchline, false)}
              >
                Update now (stop immediately)
              </Button>
              <Button
                onClick={() => handleUpdateCurrentChoice(pendingUpdateCurrentPatchline, true)}
              >
                Graceful update (1 min warning)
              </Button>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setUpdateCurrentChoiceOpen(false)}>
                Cancel
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Progress card */}
      {(updating || updateDone || backgroundUpdateInProgress) && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <p className="font-medium">
              {updateDone
                ? updateDone.message
                : backgroundUpdateInProgress && !updating
                  ? `Update in progress${serverStatus?.update_in_progress && serverStatus.update_in_progress !== "__update_all__" ? ` (${serverStatus.update_in_progress})` : ""}… (running in background)`
                  : progressStatus || "Preparing download..."}
            </p>
            {!updateDone && progressDetail && updating && (
              <p className="text-sm text-muted-foreground">{progressDetail}</p>
            )}
            <div className="flex items-center gap-3">
              {backgroundUpdateInProgress && !updating ? (
                <div className="flex flex-1 items-center gap-2">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  <div className="flex-1 h-3 rounded-full bg-primary/20 overflow-hidden">
                    <div className="h-full w-1/3 animate-pulse bg-primary/50 rounded-full" />
                  </div>
                </div>
              ) : (
                <>
                  <Progress
                    value={progress}
                    className={`flex-1 h-3 ${
                      updateDone
                        ? updateDone.ok
                          ? "[&>div]:bg-emerald-500"
                          : "[&>div]:bg-red-500"
                        : ""
                    }`}
                  />
                  <span className="text-sm font-medium w-12 text-right">
                    {Math.round(progress)}%
                  </span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

        </>
      )}

        </div>
      </div>
    </div>
  );
}
