import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import { useSettings } from "./useSettings";
import type { ServerStatus } from "../types";

export function useServerStatus() {
  const { data: settings } = useSettings();
  const activeInstance = settings?.active_instance;
  return useQuery<ServerStatus>({
    queryKey: ["server", "status", activeInstance],
    queryFn: () => api("/api/server/status"),
    refetchInterval: 1000,
    enabled: true, // Always fetch for running_instances on dashboard
  });
}

export function useStartServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instance?: string) =>
      api<{ ok: boolean }>("/api/server/start", {
        method: "POST",
        body: instance ? JSON.stringify({ instance }) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["server", "status"] });
    },
  });
}

export function useStopServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instance?: string) =>
      api<{ ok: boolean }>("/api/server/stop", {
        method: "POST",
        body: instance ? JSON.stringify({ instance }) : undefined,
      }),
    onSuccess: () => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["server", "status"] });
      }, 1000);
    },
  });
}
