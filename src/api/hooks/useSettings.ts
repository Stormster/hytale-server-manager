import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { AppSettings } from "@/api/types";

export function useSettings() {
  return useQuery<AppSettings>({
    queryKey: ["settings"],
    queryFn: () => api<AppSettings>("/api/settings"),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      root_dir?: string;
      instance_name?: string;
      instance_server_settings?: Record<string, unknown>;
      game_port?: number;
      webserver_port?: number;
    }) =>
      api<AppSettings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      if (variables.instance_name) {
        qc.invalidateQueries({ queryKey: ["instances"] });
        qc.invalidateQueries({ queryKey: ["server-status"] });
      }
    },
  });
}
