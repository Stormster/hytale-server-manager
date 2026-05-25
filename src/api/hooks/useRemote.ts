import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/api/client";

export interface RemoteConnection {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
}

export function useRemoteConnections() {
  return useQuery({
    queryKey: ["remote", "connections"],
    queryFn: () =>
      api<{ connections: RemoteConnection[]; active_connection: string }>(
        "/api/remote/connections"
      ),
  });
}

export function useAddRemoteConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; base_url: string; api_key: string }) =>
      api<RemoteConnection>("/api/remote/connections", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["remote"] });
      toast.success("Remote connection saved");
    },
    onError: (e) => toast.error((e as Error).message),
  });
}

export function useSetActiveConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (connection_id: string) =>
      api<{ active_connection: string }>("/api/remote/active", {
        method: "POST",
        body: JSON.stringify({ connection_id }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["remote"] }),
    onError: (e) => toast.error((e as Error).message),
  });
}

export function useRemoteCommand() {
  return useMutation({
    mutationFn: (body: { connection_id: string; command: string }) =>
      api<{ output?: string; timed_out?: boolean; error?: string }>(
        "/api/remote/command",
        { method: "POST", body: JSON.stringify(body) }
      ),
  });
}

export function useTestRemoteInfo() {
  return useMutation({
    mutationFn: (connection_id: string) =>
      api<Record<string, unknown>>(`/api/remote/info?connection_id=${encodeURIComponent(connection_id)}`),
  });
}
