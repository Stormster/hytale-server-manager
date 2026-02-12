import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { Instance } from "@/api/types";

export function useInstances() {
  return useQuery<Instance[]>({
    queryKey: ["instances"],
    queryFn: () => api<Instance[]>("/api/instances"),
  });
}

export function useSetActiveInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api("/api/instances/active", {
        method: "PUT",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["instances"] });
      // Refresh all instance-dependent data
      qc.invalidateQueries({ queryKey: ["server-status"] });
      qc.invalidateQueries({ queryKey: ["updater-local-status"] });
      qc.invalidateQueries({ queryKey: ["backups"] });
    },
  });
}

export function useCreateInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api("/api/instances", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instances"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["server-status"] });
      qc.invalidateQueries({ queryKey: ["updater-local-status"] });
    },
  });
}

export function useImportInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; source_path: string }) =>
      api("/api/instances/import", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instances"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["server-status"] });
      qc.invalidateQueries({ queryKey: ["updater-local-status"] });
    },
  });
}

export function useRenameInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, newName }: { name: string; newName: string }) =>
      api(`/api/instances/${encodeURIComponent(name)}/rename`, {
        method: "PUT",
        body: JSON.stringify({ new_name: newName }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instances"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["server-status"] });
      qc.invalidateQueries({ queryKey: ["updater-local-status"] });
      qc.invalidateQueries({ queryKey: ["backups"] });
    },
  });
}

export function useDeleteInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, deleteFiles }: { name: string; deleteFiles: boolean }) =>
      api(
        `/api/instances/${encodeURIComponent(name)}?delete_files=${deleteFiles}`,
        { method: "DELETE" }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instances"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["server-status"] });
      qc.invalidateQueries({ queryKey: ["updater-local-status"] });
      qc.invalidateQueries({ queryKey: ["backups"] });
    },
  });
}
