import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeSSE } from "@/api/client";
import { toast } from "sonner";

export function useUpdateRefresh() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    const p = queryClient.refetchQueries({ queryKey: ["updater", "all-instances"] });
    queryClient.refetchQueries({ queryKey: ["instances"] });
    queryClient.refetchQueries({ queryKey: ["updater", "local-status"] });
    queryClient.refetchQueries({ queryKey: ["server", "status"] });
    queryClient.refetchQueries({ queryKey: ["mods", "nitrado-update-status-all"] });
    queryClient.refetchQueries({ queryKey: ["mods", "nitrado-update-status"] });
    return p;
  }, [queryClient]);
}

export function useUpdateFlow(refreshOnUpdateComplete: () => Promise<unknown>) {
  const mountedRef = useRef(true);
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const [progressDetail, setProgressDetail] = useState("");
  const [updateDone, setUpdateDone] = useState<{ ok: boolean; message: string } | null>(null);
  const [backupFailureDialogOpen, setBackupFailureDialogOpen] = useState(false);
  const [backupFailureMessage, setBackupFailureMessage] = useState("");
  const [lastUpdateAttempt, setLastUpdateAttempt] = useState<{
    patchline: string;
    graceful: boolean;
  } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resetProgress = useCallback(() => {
    setUpdating(true);
    setProgress(0);
    setProgressStatus("Preparing...");
    setProgressDetail("");
    setUpdateDone(null);
  }, []);

  const doUpdateActual = useCallback(
    (patchline: string, options?: { graceful?: boolean; skipBackup?: boolean }) => {
      const graceful = options?.graceful ?? false;
      const skipBackup = options?.skipBackup ?? false;
      setLastUpdateAttempt({ patchline, graceful });
      setBackupFailureDialogOpen(false);
      setBackupFailureMessage("");
      resetProgress();

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
              const code = String(d.code ?? "");
              const canSkipBackup = Boolean(d.can_skip_backup);
              if (mountedRef.current) {
                setUpdateDone({ ok, message: msg });
                setUpdating(false);
                if (ok) setProgress(100);
                if (!ok && code === "backup_failed" && canSkipBackup) {
                  setBackupFailureMessage(msg || "Pre-update backup failed.");
                  setBackupFailureDialogOpen(true);
                }
              }
              if (ok) {
                refreshOnUpdateComplete().then(() => {
                  if (mountedRef.current) setUpdateDone(null);
                });
                toast.success("Server update completed");
              } else if (code === "backup_failed" && canSkipBackup) {
                toast.warning("Pre-update backup failed. Choose how to continue.");
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
        { method: "POST", body: JSON.stringify({ graceful, skip_backup: skipBackup }) }
      );
    },
    [refreshOnUpdateComplete, resetProgress]
  );

  const runUpdateAll = useCallback(
    (graceful = false) => {
      resetProgress();
      subscribeSSE(
        "/api/updater/update-all",
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
        },
        { method: "POST", body: JSON.stringify({ graceful }) }
      );
    },
    [refreshOnUpdateComplete, resetProgress]
  );

  return {
    updating,
    progress,
    progressStatus,
    progressDetail,
    updateDone,
    setUpdateDone,
    backupFailureDialogOpen,
    setBackupFailureDialogOpen,
    backupFailureMessage,
    lastUpdateAttempt,
    doUpdateActual,
    runUpdateAll,
  };
}
