import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { AuthStatus, AuthHealth } from "../types";

export function useAuthStatus() {
  return useQuery<AuthStatus>({
    queryKey: ["auth", "status"],
    queryFn: () => api("/api/auth/status"),
  });
}

export function useAuthHealth(enabled = true) {
  return useQuery<AuthHealth>({
    queryKey: ["auth", "health"],
    queryFn: () => api("/api/auth/health"),
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useInvalidateAuth() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["auth", "status"] });
    qc.invalidateQueries({ queryKey: ["auth", "health"] });
  };
}
