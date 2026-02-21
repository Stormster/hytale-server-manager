import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../client";
import { useSettings } from "./useSettings";
import { useInstances } from "./useInstances";
import type { UpdaterLocalStatus, UpdaterFullStatus } from "../types";

export interface InstanceUpdateInfo {
  update_available: boolean;
  installed_version: string;
  installed_patchline: string;
  can_switch_release: boolean;
  can_switch_prerelease: boolean;
}

export interface AllInstancesUpdateStatus {
  instances: Record<string, InstanceUpdateInfo>;
  remote_release: string | null;
  remote_prerelease: string | null;
}

export function useAllInstancesUpdateStatus() {
  const { data: instances } = useInstances();
  const hasInstalled = instances?.some((i) => i.installed) ?? false;
  return useQuery<AllInstancesUpdateStatus>({
    queryKey: ["updater", "all-instances"],
    queryFn: () => api("/api/updater/check-all"),
    enabled: hasInstalled,
    staleTime: 1000 * 60 * 30, // 30 min – invalidate on update complete
  });
}

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
