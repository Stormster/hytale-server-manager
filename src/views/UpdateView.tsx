import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/StatusBadge";
import { InfoRow } from "@/components/InfoRow";
import { InstallServerDialog } from "@/components/InstallServerDialog";
import { useUpdaterLocalStatus, useAllInstancesUpdateStatus } from "@/api/hooks/useUpdater";
import { useSettings } from "@/api/hooks/useSettings";
import { useServerStatus } from "@/api/hooks/useServer";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeSSE } from "@/api/client";
import { Download, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export function UpdateView() {
  const { data: settings } = useSettings();
  const queryClient = useQueryClient();

  const invalidateOnUpdateComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["updater", "all-instances"] });
    queryClient.invalidateQueries({ queryKey: ["instances"] });
    queryClient.invalidateQueries({ queryKey: ["updater", "local-status"] });
    queryClient.invalidateQueries({ queryKey: ["server", "status"] });
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

  const { data: serverStatus } = useServerStatus();
  const serverRunning = serverStatus?.running ?? false;

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

  const doUpdateActual = useCallback((patchline: string) => {
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
              invalidateOnUpdateComplete();
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
      { method: "POST" }
    );
  }, [invalidateOnUpdateComplete]);

  const doUpdate = doUpdateActual;

  const iv = localStatus?.installed_version ?? "...";
  const ip = localStatus?.installed_patchline ?? "release";
  const notInstalled = iv === "unknown" || iv === "...";

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h2 className="text-xl font-bold">Server Updates</h2>

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

      {/* Status row */}
      <div className="flex items-center justify-between">
        <StatusBadge
          text={
            hasStatus
              ? updateAvailable
                ? `Update available: ${ip === "release" ? rr : rp}`
                : `Up to date on ${ip}`
              : checkingUpdates
                ? "Checking..."
                : "No update data"
          }
          variant={
            hasStatus
              ? updateAvailable
                ? "warning"
                : "ok"
              : "neutral"
          }
        />
        <Button
          onClick={handleRefresh}
          disabled={checkingUpdates || updating}
        >
          {checkingUpdates ? "Checking..." : "Refresh"}
        </Button>
      </div>

      {/* Server must be stopped to update */}
      {serverRunning && !updating && !updateDone && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p className="text-sm">Stop the server before updating.</p>
        </div>
      )}

      {/* Action card - update on current channel */}
      {hasStatus && updateAvailable && !updating && !updateDone && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <p className="font-semibold">New {ip} version available</p>
              <p className="text-sm text-muted-foreground">
                {iv} → {ip === "release" ? rr : rp}
              </p>
            </div>
            <Button onClick={() => doUpdate(ip)} disabled={serverRunning}>
              Update to {ip === "release" ? rr : rp}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Progress card */}
      {(updating || updateDone) && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <p className="text-sm">{updateDone?.message ?? progressStatus}</p>
            <div className="flex items-center gap-3">
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
            </div>
            {progressDetail && (
              <p className="text-xs text-muted-foreground">{progressDetail}</p>
            )}
          </CardContent>
        </Card>
      )}

        </>
      )}
    </div>
  );
}
