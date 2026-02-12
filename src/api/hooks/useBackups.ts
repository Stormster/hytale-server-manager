import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { Backup } from "../types";

export function useBackups() {
  return useQuery<Backup[]>({
    queryKey: ["backups"],
    queryFn: () => api("/api/backups"),
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

export function useDeleteBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (folderName: string) =>
      api<{ ok: boolean }>(`/api/backups/${encodeURIComponent(folderName)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backups"] });
    },
  });
}
