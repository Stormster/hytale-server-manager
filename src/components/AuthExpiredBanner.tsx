import { useEffect, useRef, useState } from "react";
import { AlertTriangle, KeyRound } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { subscribeSSE } from "@/api/client";
import { useAuthHealth } from "@/api/hooks/useAuth";
import { parseAuthOutput } from "@/lib/authOutput";
import { toast } from "sonner";

export function AuthExpiredBanner({
  onNavigateToSettings,
}: {
  onNavigateToSettings?: () => void;
}) {
  const { data: authHealth } = useAuthHealth(true);
  const queryClient = useQueryClient();
  const [reauthing, setReauthing] = useState(false);
  const notifiedRef = useRef(false);
  const authLinesRef = useRef<string[]>([]);
  const autoOpenedRef = useRef(false);

  const expired = !!authHealth?.auth_expired;

  useEffect(() => {
    if (!expired || notifiedRef.current) return;
    notifiedRef.current = true;
    toast.error("Hytale auth expired", {
      description:
        authHealth?.error ||
        "Downloads and update checks will fail until you re-authenticate.",
      duration: 9000,
    });
  }, [expired, authHealth?.error]);

  const handleReauth = () => {
    if (reauthing) return;
    setReauthing(true);
    authLinesRef.current = [];
    autoOpenedRef.current = false;

    subscribeSSE(
      "/api/auth/refresh",
      {
        onEvent(event, data) {
          const d = data as Record<string, unknown>;
          if (event === "output") {
            const line = String(d.line ?? "");
            authLinesRef.current = [...authLinesRef.current, line];
            if (!autoOpenedRef.current) {
              const { authUrl } = parseAuthOutput(authLinesRef.current);
              if (authUrl) {
                autoOpenedRef.current = true;
                import("@tauri-apps/plugin-opener")
                  .then(({ openUrl }) => openUrl(authUrl))
                  .catch(() =>
                    import("@tauri-apps/plugin-shell").then(({ open }) =>
                      open(authUrl)
                    )
                  )
                  .catch(() => {});
              }
            }
          } else if (event === "done") {
            const code = Number(d.code ?? 1);
            setReauthing(false);
            queryClient.invalidateQueries({ queryKey: ["auth", "status"] });
            queryClient.invalidateQueries({ queryKey: ["auth", "health"] });
            queryClient.invalidateQueries({ queryKey: ["updater", "all-instances"] });
            if (code === 0) {
              toast.success("Auth refreshed successfully");
            } else {
              toast.error("Auth refresh failed. Please try again.");
            }
          }
        },
        onError() {
          setReauthing(false);
          toast.error("Connection error");
        },
      },
      { method: "POST" }
    );
  };

  if (!expired) return null;

  return (
    <div className="flex flex-col gap-2 border-b bg-red-500/15 px-4 py-3 text-red-600 dark:text-red-400 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <p className="text-sm">
          Hytale auth expired. Update checks and downloads will fail until you
          re-authenticate.
        </p>
      </div>
      <div className="flex gap-2">
        {onNavigateToSettings && (
          <Button variant="outline" size="sm" onClick={onNavigateToSettings}>
            Settings
          </Button>
        )}
        <Button
          size="sm"
          onClick={handleReauth}
          disabled={reauthing}
          className="gap-1.5"
        >
          <KeyRound className="h-3.5 w-3.5" />
          {reauthing ? "Re-authenticating..." : "Re-auth now"}
        </Button>
      </div>
    </div>
  );
}
