import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import { useSettings } from "./useSettings";
import type { Mod } from "../types";

interface ModsResponse {
  mods: Mod[];
}

export function useMods() {
  const { data: settings } = useSettings();
  const activeInstance = settings?.active_instance;
  return useQuery<ModsResponse>({
    queryKey: ["mods", activeInstance],
    queryFn: () => api<ModsResponse>("/api/mods"),
    enabled: !!activeInstance,
    refetchInterval: 5000, // Auto-refresh when mods are added/removed from folder
  });
}

export function useToggleMod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { path: string; enabled: boolean }) =>
      api<{ ok: boolean }>("/api/mods/toggle", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mods"] });
    },
  });
}
