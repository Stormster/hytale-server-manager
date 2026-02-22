import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, subscribeSSE } from "../client";
import { useSettings } from "./useSettings";
import type { Mod } from "../types";

interface ModsResponse {
  mods: Mod[];
}

export function useMods() {
  const { data: settings } = useSettings();
  const activeInstance = settings?.active_instance;
  const queryClient = useQueryClient();

  const query = useQuery<ModsResponse>({
    queryKey: ["mods", activeInstance],
    queryFn: () => api<ModsResponse>("/api/mods"),
    enabled: !!activeInstance,
    refetchInterval: 10000, // Fallback poll if watch disconnects
  });

  // Subscribe to mods folder file watcher for instant updates
  useEffect(() => {
    if (!activeInstance) return;
    const unsubscribe = subscribeSSE(
      "/api/mods/watch",
      {
        onEvent(event) {
          if (event === "mods_changed") {
            queryClient.invalidateQueries({ queryKey: ["mods"] });
          }
        },
        onError() {
          // Ignore – refetchInterval will pick up changes
        },
      },
      { method: "GET" }
    );
    return unsubscribe;
  }, [activeInstance, queryClient]);

  return query;
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
