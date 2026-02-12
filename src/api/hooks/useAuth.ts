import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { AuthStatus } from "../types";

export function useAuthStatus() {
  return useQuery<AuthStatus>({
    queryKey: ["auth", "status"],
    queryFn: () => api("/api/auth/status"),
  });
}

export function useInvalidateAuth() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["auth", "status"] });
}
