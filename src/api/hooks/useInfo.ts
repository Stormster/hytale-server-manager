import { useQuery } from "@tanstack/react-query";
import { api } from "../client";
import type { AppInfo, ManagerUpdateInfo } from "../types";

export function useAppInfo() {
  return useQuery<AppInfo>({
    queryKey: ["info"],
    queryFn: () => api("/api/info"),
  });
}

export function useManagerUpdate() {
  return useQuery<ManagerUpdateInfo>({
    queryKey: ["info", "manager-update"],
    queryFn: () => api("/api/info/manager-update"),
    staleTime: 5 * 60 * 1000, // cache for 5 minutes
  });
}

export function useLocalIp(enabled = true) {
  return useQuery<{ ip: string | null; ok: boolean }>({
    queryKey: ["info", "local-ip"],
    queryFn: () => api("/api/info/local-ip"),
    enabled,
  });
}

export function usePublicIp(enabled = true) {
  return useQuery<{ ip: string | null; ok: boolean; error?: string }>({
    queryKey: ["info", "public-ip"],
    queryFn: () => api("/api/info/public-ip"),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
