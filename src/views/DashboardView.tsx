import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/StatusBadge";
import { InfoRow } from "@/components/InfoRow";
import { useServerStatus, useStopServer } from "@/api/hooks/useServer";
import { useUpdaterLocalStatus } from "@/api/hooks/useUpdater";
import { useAppInfo } from "@/api/hooks/useInfo";
import { useManagerUpdate } from "@/api/hooks/useInfo";
import { useSettings } from "@/api/hooks/useSettings";
import type { ViewName } from "@/components/AppSidebar";
import { ExternalLink } from "lucide-react";

interface DashboardViewProps {
  onNavigate: (view: ViewName) => void;
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const { data: settings } = useSettings();
  const { data: serverStatus } = useServerStatus();
  const { data: updaterStatus } = useUpdaterLocalStatus();
  const { data: appInfo } = useAppInfo();
  const { data: managerUpdate } = useManagerUpdate();
  const stopServer = useStopServer();

  const installed = serverStatus?.installed ?? false;
  const running = serverStatus?.running ?? false;
  const activeInstance = settings?.active_instance || "None";

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Manager update banner */}
      {managerUpdate?.update_available && (
        <div className="flex items-center justify-between rounded-lg border bg-accent/50 px-4 py-3">
          <p className="text-sm">
            Manager v{managerUpdate.latest_version} is available (current:
            v{appInfo?.manager_version})
          </p>
          {managerUpdate.download_url && (
            <a
              href={managerUpdate.download_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-400 hover:underline"
            >
              View release <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      <h2 className="text-xl font-bold">Dashboard</h2>

      {/* Status card */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <StatusBadge
            text={
              !installed
                ? "Not Installed"
                : running
                  ? "Running"
                  : "Stopped"
            }
            variant={
              !installed ? "warning" : running ? "ok" : "neutral"
            }
          />
          <Separator />
          <InfoRow label="Active instance" value={activeInstance} />
          <InfoRow
            label="Installed version"
            value={installed ? (updaterStatus?.installed_version ?? "...") : "--"}
          />
          <InfoRow
            label="Patchline"
            value={
              installed
                ? (updaterStatus?.installed_patchline ?? "...").replace(
                    /^\w/,
                    (c) => c.toUpperCase()
                  )
                : "--"
            }
          />
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
        </CardContent>
      </Card>

      {/* Quick actions */}
      {installed && (
        <div className="flex gap-3">
          <Button
            onClick={() => onNavigate("server")}
            disabled={running}
          >
            Start Server
          </Button>
          <Button
            variant="destructive"
            onClick={() => stopServer.mutate()}
            disabled={!running}
          >
            Stop Server
          </Button>
        </div>
      )}

      {/* Not installed hint */}
      {!installed && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              This instance doesn't have a server installed yet. Click your
              instance name in the sidebar to{" "}
              <strong>Add Server</strong> or go to{" "}
              <button
                onClick={() => onNavigate("updates")}
                className="text-blue-400 hover:underline font-medium"
              >
                Updates
              </button>{" "}
              to install one.
            </p>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Report issues: {appInfo?.report_url ?? "https://HytaleManager.com/issues"}
      </p>
    </div>
  );
}
