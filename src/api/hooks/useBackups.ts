import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
      toast.success("Backup created");
    },
    onError: (err) => toast.error((err as Error).message),
  });
}

export function useRestoreBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (folderName: string) =>
      api<{ ok: boolean }>(`/api/backups/${encodeURIComponent(folderName)}/restore`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backups"] });
      qc.invalidateQueries({ queryKey: ["instances"] });
      toast.success("Backup restored");
    },
    onError: (err) => toast.error((err as Error).message),
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
      toast.success("Backup renamed");
    },
    onError: (err) => toast.error((err as Error).message),
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
      toast.success("Backup deleted");
    },
    onError: (err) => toast.error((err as Error).message),
  });
}
