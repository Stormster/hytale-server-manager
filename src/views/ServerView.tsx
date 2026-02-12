import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { LogConsole } from "@/components/LogConsole";
import {
  useServerStatus,
  useStartServer,
  useStopServer,
} from "@/api/hooks/useServer";
import { subscribeSSE } from "@/api/client";

export function ServerView() {
  const { data: status } = useServerStatus();
  const startServer = useStartServer();
  const stopServer = useStopServer();

  const [lines, setLines] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);

  const running = status?.running ?? false;
  const installed = status?.installed ?? false;

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

  // Auto-connect when server becomes running
  useEffect(() => {
    if (running && !connected) {
      connectConsole();
    }
  }, [running, connected, connectConsole]);

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
      <LogConsole lines={lines} className="flex-1 min-h-0" />
    </div>
  );
}
