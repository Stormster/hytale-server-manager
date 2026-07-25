import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useServerStatus } from "@/api/hooks/useServer";
import type { ServerStatus } from "@/api/types";
import {
  countRunningFromStatus,
  getRunningServerCount,
  performLifecycleAction,
  type LifecycleAction,
} from "@/lib/appLifecycle";

type AppLifecycleContextValue = {
  /** Restart the manager app (prompts if game servers are running). */
  requestRestart: () => Promise<void>;
};

const AppLifecycleContext = createContext<AppLifecycleContextValue | null>(null);

export function useAppLifecycle(): AppLifecycleContextValue {
  const ctx = useContext(AppLifecycleContext);
  if (!ctx) {
    throw new Error("useAppLifecycle must be used within AppLifecycleProvider");
  }
  return ctx;
}

function cachedRunningCount(queryClient: ReturnType<typeof useQueryClient>): number {
  const entries = queryClient.getQueriesData<ServerStatus>({
    queryKey: ["server", "status"],
  });
  let max = 0;
  for (const [, data] of entries) {
    max = Math.max(max, countRunningFromStatus(data));
  }
  return max;
}

export function AppLifecycleProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // Keep status subscription warm so close/restart can use a fresh cache without waiting.
  const { data: serverStatus } = useServerStatus();
  const [dialog, setDialog] = useState<{
    action: LifecycleAction;
    count: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const dialogOpenRef = useRef(false);
  const runningCountRef = useRef(0);
  dialogOpenRef.current = dialog != null;
  runningCountRef.current = Math.max(
    countRunningFromStatus(serverStatus),
    cachedRunningCount(queryClient)
  );

  const runAction = useCallback(async (action: LifecycleAction) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await performLifecycleAction(action);
    } finally {
      busyRef.current = false;
      setBusy(false);
      setDialog(null);
    }
  }, []);

  const requestWithServerCheck = useCallback(
    async (action: LifecycleAction) => {
      if (busyRef.current) return;

      // Prefer the already-polled status so the dialog opens immediately.
      let count = runningCountRef.current;
      if (count > 0) {
        setDialog({ action, count });
        return;
      }

      // Cache says idle — quick verify in case a server just started.
      try {
        count = await getRunningServerCount(800);
      } catch {
        count = 0;
      }
      if (count > 0) {
        setDialog({ action, count });
        return;
      }
      await runAction(action);
    },
    [runAction]
  );

  const requestRestart = useCallback(async () => {
    await requestWithServerCheck("restart");
  }, [requestWithServerCheck]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        unlisten = await win.onCloseRequested(async (event) => {
          event.preventDefault();
          if (busyRef.current || dialogOpenRef.current) return;
          await requestWithServerCheck("exit");
        });
      } catch {
        // Not in Tauri (browser dev)
      }
    })();
    return () => unlisten?.();
  }, [requestWithServerCheck]);

  const confirm = () => {
    if (!dialog || busy) return;
    void runAction(dialog.action);
  };

  const title =
    dialog?.action === "restart" ? "Restart manager?" : "Close manager?";
  const actionVerb = dialog?.action === "restart" ? "Restart" : "Close";
  const count = dialog?.count ?? 0;

  return (
    <AppLifecycleContext.Provider value={{ requestRestart }}>
      {children}
      <Dialog
        open={dialog != null}
        onOpenChange={(open) => {
          if (!open && !busy) setDialog(null);
        }}
      >
        <DialogContent hideClose={busy}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {count} {count === 1 ? "server is" : "servers are"} currently
                  running. {actionVerb === "Restart" ? "Restarting" : "Closing"}{" "}
                  the manager will safely shut {count === 1 ? "it" : "them"} down
                  first.
                </p>
                <p className="text-xs">
                  Players will be disconnected when the server stops. You can
                  cancel and stop servers yourself first if you prefer.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialog(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={confirm} disabled={busy}>
              {busy ? "Shutting down…" : `${actionVerb} manager`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLifecycleContext.Provider>
  );
}
