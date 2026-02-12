import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { ServerStatus } from "../types";

export function useServerStatus() {
  return useQuery<ServerStatus>({
    queryKey: ["server", "status"],
    queryFn: () => api("/api/server/status"),
    refetchInterval: 3000,
  });
}

export function useStartServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: boolean }>("/api/server/start", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["server", "status"] });
    },
  });
}

export function useStopServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: boolean }>("/api/server/stop", { method: "POST" }),
    onSuccess: () => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["server", "status"] });
      }, 1000);
    },
  });
}
