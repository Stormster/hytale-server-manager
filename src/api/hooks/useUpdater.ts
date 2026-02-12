import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../client";
import { useSettings } from "./useSettings";
import type { UpdaterLocalStatus, UpdaterFullStatus } from "../types";

export function useUpdaterLocalStatus() {
  const { data: settings } = useSettings();
  const activeInstance = settings?.active_instance;
  return useQuery<UpdaterLocalStatus>({
    queryKey: ["updater", "local-status", activeInstance],
    queryFn: () => api("/api/updater/status"),
    enabled: !!activeInstance,
  });
}

export function useCheckUpdates() {
  return useMutation<UpdaterFullStatus>({
    mutationFn: () => api("/api/updater/check", { method: "POST" }),
  });
}
