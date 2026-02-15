import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { ServerConsole } from "@/components/ServerConsole";
import { ServerAuthModal } from "@/components/ServerAuthModal";
import {
  useServerStatus,
  useStartServer,
  useStopServer,
} from "@/api/hooks/useServer";
import { useSettings } from "@/api/hooks/useSettings";
import { usePublicIp } from "@/api/hooks/useInfo";
import { subscribeSSE } from "@/api/client";
import { formatUptime } from "@/lib/timeAgo";
import { HardDrive, Cpu, Users, Copy } from "lucide-react";

const AUTH_NEEDED = /no server tokens configured/i;
const AUTH_ALREADY_LOADED = /token refresh scheduled|session service client initialized/i;

export function ServerView() {
  const { data: settings } = useSettings();
  const { data: status } = useServerStatus();
  const startServer = useStartServer();
  const stopServer = useStopServer();

  const activeInstance = settings?.active_instance ?? "";
  const runningInstance = status?.running_instance ?? null;
  const runningInstances = status?.running_instances ?? [];
  const viewingRunningInstance =
    !!activeInstance && activeInstance === runningInstance;
  const isActiveInstanceRunning =
    !!activeInstance && runningInstances.some((r) => r.name === activeInstance);

  const [lines, setLines] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const authShownRef = useRef(false);
  const authPendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linesRef = useRef<string[]>([]);
  const abortRef = useRef<(() => void) | null>(null);

  linesRef.current = lines;
  const running = status?.running ?? false;
  const installed = status?.installed ?? false;
  const { data: publicIpData } = usePublicIp(installed);
  const displayRunInfo = running
    ? runningInstances.find((r) => r.name === (viewingRunningInstance ? activeInstance : runningInstance))
    : null;

  // Detect "No server tokens configured" - only show modal if credentials aren't already loaded.
  // Server may output "No server tokens" briefly during boot before loading encrypted store.
  useEffect(() => {
    if (!running || authShownRef.current) return;
    const allText = lines.join("\n");
    if (!AUTH_NEEDED.test(allText)) return;
    if (AUTH_ALREADY_LOADED.test(allText)) {
      // Credentials loaded - cancel any pending modal
      if (authPendingRef.current) {
        clearTimeout(authPendingRef.current);
        authPendingRef.current = null;
      }
      return;
    }

    // Delay 2.5s before showing - give server time to load credentials from disk
    if (authPendingRef.current) return;
    authPendingRef.current = setTimeout(() => {
      authPendingRef.current = null;
      const text = linesRef.current.join("\n");
      if (AUTH_ALREADY_LOADED.test(text)) return;
      authShownRef.current = true;
      setAuthModalOpen(true);
    }, 2500);
    return () => {
      if (authPendingRef.current) {
        clearTimeout(authPendingRef.current);
        authPendingRef.current = null;
      }
    };
  }, [running, lines]);

  useEffect(() => {
    if (!running) {
      authShownRef.current = false;
      if (authPendingRef.current) {
        clearTimeout(authPendingRef.current);
        authPendingRef.current = null;
      }
    }
  }, [running]);

  // Connect to the console SSE stream when server is running
  const connectConsole = useCallback((instance: string) => {
    if (abortRef.current) abortRef.current();

    setConnected(true);
    const consoleUrl = `/api/server/console?instance=${encodeURIComponent(instance)}`;
    abortRef.current = subscribeSSE(consoleUrl, {
      onEvent(event, data) {
        const d = data as Record<string, unknown>;
        if (event === "output") {
          setLines((prev) => [...prev, d.line as string]);
        } else if (event === "done") {
          setLines((prev) => [
            ...prev,
            `\n[Manager] Server exited (code ${d.code}).`,
          ]);
          setConnected(false);
        }
      },
      onError() {
        setConnected(false);
      },
      onDone() {
        setConnected(false);
      },
    });
  }, []);

  const doConnect = useCallback(() => {
    if (activeInstance) connectConsole(activeInstance);
  }, [activeInstance, connectConsole]);

  // When switching instances: disconnect and clear console
  useEffect(() => {
    if (abortRef.current) abortRef.current();
    setLines([]);
    setConnected(false);
  }, [activeInstance]);

  // Auto-connect when viewing the running instance and server is running
  useEffect(() => {
    if (viewingRunningInstance && running && !connected && activeInstance) {
      doConnect();
    }
  }, [viewingRunningInstance, running, connected, activeInstance, doConnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current();
    };
  }, []);

  const handleStart = () => {
    setLines([]);
    startServer.mutate(activeInstance || undefined, {
      onSuccess: () => {
        if (activeInstance) {
          setTimeout(() => connectConsole(activeInstance), 300);
        }
      },
    });
  };

  const handleStop = () => {
    setLines((prev) => [...prev, "[Manager] Stopping server..."]);
    // Stop the instance we're viewing, or the running one if viewing a different instance
    const toStop = viewingRunningInstance ? activeInstance : runningInstance;
    stopServer.mutate(toStop ?? undefined);
  };

  const gamePort = displayRunInfo?.game_port ?? status?.running_instances?.[0]?.game_port ?? 5520;
  const copyIp = async () => {
    const ip = publicIpData?.ip;
    if (!ip) return;
    const text = `${ip}:${gamePort}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-HTTPS
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };

  return (
    <div className="flex h-full flex-col p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <h2 className="text-xl font-bold">Server Console</h2>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge
            text={running ? "Running" : "Stopped"}
            variant={running ? "ok" : "neutral"}
          />
          {installed && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-card/60 px-3 py-2 text-sm">
              <span title="Uptime">
                {formatUptime(displayRunInfo?.uptime_seconds ?? status?.uptime_seconds ?? null)}
              </span>
              <span className="flex items-center gap-1" title="RAM">
                <HardDrive className="h-4 w-4" />
                {displayRunInfo?.ram_mb ?? status?.ram_mb ?? 0} MB
              </span>
              <span className="flex items-center gap-1" title="CPU">
                <Cpu className="h-4 w-4" />
                {displayRunInfo?.cpu_percent ?? status?.cpu_percent ?? 0}%
              </span>
              <span className="flex items-center gap-1" title="Players">
                <Users className="h-4 w-4" />
                {status?.players ?? 0}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2"
                onClick={copyIp}
                disabled={!publicIpData?.ip}
                title="Copy public IP and port"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy IP
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3 mb-4">
        <Button
          onClick={handleStart}
          disabled={isActiveInstanceRunning || !installed}
        >
          Start Server
        </Button>
        <Button
          variant="destructive"
          onClick={handleStop}
          disabled={!running}
        >
          Stop Server
        </Button>
        <Button
          variant="outline"
          onClick={() => setLines([])}
        >
          Clear Log
        </Button>
      </div>

      {/* Console */}
      <ServerConsole
        lines={lines}
        running={viewingRunningInstance && running}
        className="flex-1 min-h-0"
      />

      <ServerAuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        lines={lines}
        running={running}
      />
    </div>
  );
}
