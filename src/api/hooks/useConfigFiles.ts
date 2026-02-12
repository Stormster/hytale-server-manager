import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import { useSettings } from "./useSettings";
import type { ConfigFileContent, LatestLog } from "../types";

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

export function useLatestLog() {
  const { data: settings } = useSettings();
  const activeInstance = settings?.active_instance;
  return useQuery<LatestLog>({
    queryKey: ["config", "latest-log", activeInstance],
    queryFn: () => api("/api/config/latest-log"),
    enabled: false, // only fetch on demand
  });
}
