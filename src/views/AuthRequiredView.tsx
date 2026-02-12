import { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AuthFlowDisplay } from "@/components/AuthFlowDisplay";
import { parseAuthOutput } from "@/lib/authOutput";
import { useInvalidateAuth } from "@/api/hooks/useAuth";
import { subscribeSSE } from "@/api/client";
import { LogIn } from "lucide-react";

export function AuthRequiredView() {
  const invalidateAuth = useInvalidateAuth();

  const [authRunning, setAuthRunning] = useState(false);
  const [authLines, setAuthLines] = useState<string[]>([]);

  const linesRef = useRef<string[]>([]);
  const autoOpenedRef = useRef(false);

  const handleSignIn = useCallback(() => {
    setAuthRunning(true);
    setAuthLines([]);
    linesRef.current = [];
    autoOpenedRef.current = false;

    subscribeSSE(
      "/api/auth/refresh",
      {
        onEvent(event, data) {
          const d = data as Record<string, unknown>;
          if (event === "output") {
            const line = d.line as string;
            linesRef.current = [...linesRef.current, line];
            setAuthLines(linesRef.current);
            if (!autoOpenedRef.current) {
              const { authUrl } = parseAuthOutput(linesRef.current);
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
            const code = d.code as number;
            if (code === 0) {
              setAuthLines((prev) => [
                ...prev,
                "Authentication successful.",
              ]);
              invalidateAuth();
            } else {
              setAuthLines((prev) => [
                ...prev,
                "Authentication may have failed. Please try again.",
              ]);
            }
            setAuthRunning(false);
          }
        },
        onError() {
          setAuthLines((prev) => [...prev, "Connection error."]);
          setAuthRunning(false);
        },
      },
      { method: "POST" }
    );
  }, [invalidateAuth]);

  return (
    <div className="relative flex h-screen w-screen items-center justify-center p-6">
      <div className="hytale-bg">
        <div className="hytale-bg-image" />
        <div className="hytale-bg-overlay" />
      </div>
      <Card className="relative w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Sign in with Hytale</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            You need to authenticate with your Hytale account to download server
            files and manage your servers.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleSignIn}
            disabled={authRunning}
            className="w-full gap-2"
          >
            <LogIn className="h-4 w-4" />
            {authRunning ? "Authenticating…" : "Sign in with Hytale"}
          </Button>
          {authLines.length > 0 && (
            <AuthFlowDisplay lines={authLines} className="space-y-3" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
