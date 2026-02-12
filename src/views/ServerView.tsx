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
import { subscribeSSE } from "@/api/client";

const AUTH_NEEDED = /no server tokens configured/i;
const AUTH_ALREADY_LOADED = /token refresh scheduled|session service client initialized/i;

export function ServerView() {
  const { data: settings } = useSettings();
  const { data: status } = useServerStatus();
  const startServer = useStartServer();
  const stopServer = useStopServer();

  const activeInstance = settings?.active_instance ?? "";
  const runningInstance = status?.running_instance ?? null;
  const viewingRunningInstance =
    !!activeInstance && activeInstance === runningInstance;

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
  const connectConsole = useCallback(() => {
    if (abortRef.current) abortRef.current();

    setConnected(true);
    abortRef.current = subscribeSSE("/api/server/console", {
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

  // When switching instances: disconnect and clear console
  useEffect(() => {
    if (abortRef.current) abortRef.current();
    setLines([]);
    setConnected(false);
  }, [activeInstance]);

  // Auto-connect when viewing the running instance and server is running
  useEffect(() => {
    if (viewingRunningInstance && running && !connected) {
      connectConsole();
    }
  }, [viewingRunningInstance, running, connected, connectConsole]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current();
    };
  }, []);

  const handleStart = () => {
    setLines([]);
    startServer.mutate(undefined, {
      onSuccess: () => {
        // Small delay then connect to console
        setTimeout(connectConsole, 300);
      },
    });
  };

  const handleStop = () => {
    setLines((prev) => [...prev, "[Manager] Stopping server..."]);
    stopServer.mutate();
  };

  return (
    <div className="flex h-full flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Server Console</h2>
        <StatusBadge
          text={running ? "Running" : "Stopped"}
          variant={running ? "ok" : "neutral"}
        />
      </div>

      {running && !viewingRunningInstance && runningInstance && (
        <p className="mb-4 rounded-md bg-muted px-4 py-2 text-sm text-muted-foreground">
          Instance <strong>{runningInstance}</strong> is running. Switch to it in
          the sidebar to view its console.
        </p>
      )}

      {/* Controls */}
      <div className="flex gap-3 mb-4">
        <Button
          onClick={handleStart}
          disabled={running || !installed}
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
