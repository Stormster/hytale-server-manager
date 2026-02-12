import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../client";
import type { UpdaterLocalStatus, UpdaterFullStatus } from "../types";

export function useUpdaterLocalStatus() {
  return useQuery<UpdaterLocalStatus>({
    queryKey: ["updater", "local-status"],
    queryFn: () => api("/api/updater/status"),
  });
}

export function useCheckUpdates() {
  return useMutation<UpdaterFullStatus>({
    mutationFn: () => api("/api/updater/check", { method: "POST" }),
  });
}
