import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import { useSettings } from "./useSettings";
import type { Backup } from "../types";

export function useBackups() {
  const { data: settings } = useSettings();
  const activeInstance = settings?.active_instance;
  return useQuery<Backup[]>({
    queryKey: ["backups", activeInstance],
    queryFn: () => api("/api/backups"),
    enabled: !!activeInstance,
  });
}

export function useCreateBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label?: string) =>
      api<Backup>("/api/backups", {
        method: "POST",
        body: JSON.stringify({ label: label || null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backups"] });
      qc.invalidateQueries({ queryKey: ["instances"] });
    },
  });
}

export function useRestoreBackup() {
  return useMutation({
    mutationFn: (folderName: string) =>
      api<{ ok: boolean }>(`/api/backups/${encodeURIComponent(folderName)}/restore`, {
        method: "POST",
      }),
  });
}

export function useRenameBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ folderName, label }: { folderName: string; label: string }) =>
      api<{ ok: boolean }>(`/api/backups/${encodeURIComponent(folderName)}/rename`, {
        method: "PUT",
        body: JSON.stringify({ label }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backups"] });
    },
  });
}

export function useDeleteBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (folderName: string) =>
      api<{ ok: boolean }>(`/api/backups/${encodeURIComponent(folderName)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backups"] });
      qc.invalidateQueries({ queryKey: ["instances"] });
    },
  });
}
