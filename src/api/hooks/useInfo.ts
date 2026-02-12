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
