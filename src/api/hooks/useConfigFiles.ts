import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import { useSettings } from "./useSettings";
import type { ConfigFileContent, LatestLog, WorldsList } from "../types";

export function useConfigFile(filename: string | null) {
  const { data: settings } = useSettings();
  const activeInstance = settings?.active_instance;
  return useQuery<ConfigFileContent>({
    queryKey: ["config", activeInstance, filename],
    queryFn: () => api(`/api/config/${filename}`),
    enabled: !!filename && !!activeInstance,
  });
}

export function useSaveConfigFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filename, content }: { filename: string; content: string }) =>
      api<{ ok: boolean }>(`/api/config/${filename}`, {
        method: "PUT",
        body: JSON.stringify({ content }),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["config", variables.filename] });
    },
  });
}

export function useWorldsList() {
  const { data: settings } = useSettings();
  const activeInstance = settings?.active_instance;
  return useQuery<WorldsList>({
    queryKey: ["config", "worlds", activeInstance],
    queryFn: () => api("/api/config/worlds"),
    enabled: !!activeInstance,
  });
}

export function useWorldConfig(worldName: string | null) {
  const { data: settings } = useSettings();
  const activeInstance = settings?.active_instance;
  return useQuery<ConfigFileContent>({
    queryKey: ["config", "world", activeInstance, worldName],
    queryFn: () => api(`/api/config/worlds/${worldName}`),
    enabled: !!activeInstance && !!worldName,
  });
}

export function useSaveWorldConfig(worldName: string) {
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const activeInstance = settings?.active_instance;
  return useMutation({
    mutationFn: ({ content }: { content: string }) =>
      api<{ ok: boolean }>(`/api/config/worlds/${worldName}`, {
        method: "PUT",
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config", "world", activeInstance, worldName] });
      qc.invalidateQueries({ queryKey: ["config", "worlds", activeInstance] });
    },
  });
}

export function useLatestLog() {
  const { data: settings } = useSettings();
  const activeInstance = settings?.active_instance;
  return useQuery<LatestLog>({
    queryKey: ["config", "latest-log", activeInstance],
    queryFn: () => api("/api/config/latest-log"),
    enabled: false, // only fetch on demand
  });
}
