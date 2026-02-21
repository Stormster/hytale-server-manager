import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/StatusBadge";
import { InfoRow } from "@/components/InfoRow";
import { InstallServerDialog } from "@/components/InstallServerDialog";
import { useUpdaterLocalStatus, useAllInstancesUpdateStatus } from "@/api/hooks/useUpdater";
import { useSettings } from "@/api/hooks/useSettings";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeSSE } from "@/api/client";
import { Download } from "lucide-react";

export function UpdateView() {
  const { data: settings } = useSettings();
  const queryClient = useQueryClient();

  const invalidateOnUpdateComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["updater", "all-instances"] });
    queryClient.invalidateQueries({ queryKey: ["instances"] });
    queryClient.invalidateQueries({ queryKey: ["updater", "local-status"] });
  }, [queryClient]);
  const [installOpen, setInstallOpen] = useState(false);
  const { data: localStatus } = useUpdaterLocalStatus();
  const { data: allUpdateStatus, isLoading: checkingUpdates, refetch: refetchUpdates } = useAllInstancesUpdateStatus();

  const activeInstance = settings?.active_instance || "None";
  const activeStatus = activeInstance !== "None" ? allUpdateStatus?.instances?.[activeInstance] : undefined;
  const rr = allUpdateStatus?.remote_release ?? null;
  const rp = allUpdateStatus?.remote_prerelease ?? null;
  const updateAvailable = activeStatus?.update_available ?? false;
  const canSwitchRelease = activeStatus?.can_switch_release ?? false;
  const canSwitchPrerelease = activeStatus?.can_switch_prerelease ?? false;
  const hasStatus = !!allUpdateStatus;

  // Update progress state
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const [progressDetail, setProgressDetail] = useState("");
  const [updateDone, setUpdateDone] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const handleRefresh = () => {
    setUpdateDone(null);
    refetchUpdates();
  };

  const doUpdate = useCallback((patchline: string) => {
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
            setProgressStatus(d.message as string);
          } else if (event === "progress") {
            setProgress(d.percent as number);
            setProgressDetail(d.detail as string);
          } else if (event === "done") {
            const ok = d.ok as boolean;
            setUpdateDone({
              ok,
              message: d.message as string,
            });
            setUpdating(false);
            if (ok) {
              setProgress(100);
              invalidateOnUpdateComplete();
            }
          }
        },
        onError() {
          setUpdateDone({ ok: false, message: "Connection error" });
          setUpdating(false);
        },
      },
      { method: "POST" }
    );
  }, [invalidateOnUpdateComplete]);

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

      {/* Action card */}
      {hasStatus && (updateAvailable || canSwitchRelease || canSwitchPrerelease) && !updating && !updateDone && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <p className="font-semibold">
                {updateAvailable
                  ? `New ${ip} version available`
                  : "No updates on your current channel"}
              </p>
              <p className="text-sm text-muted-foreground">
                {updateAvailable
                  ? `${iv} \u2192 ${ip === "release" ? rr : rp}`
                  : `You're running the latest ${ip} version.`}
              </p>
            </div>
            <div className="flex gap-3">
              {updateAvailable && (
                <Button onClick={() => doUpdate(ip)}>
                  Update to {ip === "release" ? rr : rp}
                </Button>
              )}
              {canSwitchRelease && (
                <Button
                  variant="outline"
                  onClick={() => doUpdate("release")}
                >
                  Switch to Release ({rr})
                </Button>
              )}
              {canSwitchPrerelease && (
                <Button
                  variant="outline"
                  onClick={() => doUpdate("pre-release")}
                >
                  Switch to Pre-Release ({rp})
                </Button>
              )}
            </div>
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
