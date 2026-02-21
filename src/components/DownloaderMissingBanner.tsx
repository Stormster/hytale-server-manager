import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, AlertTriangle } from "lucide-react";
import { useAppInfo } from "@/api/hooks/useInfo";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeSSE } from "@/api/client";
import { toast } from "sonner";

export function DownloaderMissingBanner({ onNavigateToSettings }: { onNavigateToSettings?: () => void }) {
  const { data: appInfo } = useAppInfo();
  const queryClient = useQueryClient();
  const [fetching, setFetching] = useState(false);
  const notifiedRef = useRef(false);

  const missing = appInfo && !appInfo.has_downloader;

  // Pop-up notification on first load when downloader is missing
  useEffect(() => {
    if (!missing || notifiedRef.current) return;
    notifiedRef.current = true;
    toast.warning("Hytale downloader not found", {
      description:
        "Server installs and updates are disabled. Go to Settings to download it.",
      duration: 8000,
      action: onNavigateToSettings
        ? { label: "Open Settings", onClick: onNavigateToSettings }
        : undefined,
    });
  }, [missing, onNavigateToSettings]);

  const handleDownload = () => {
    if (fetching) return;
    setFetching(true);

    subscribeSSE(
      "/api/info/fetch-downloader",
      {
        onEvent(event, data) {
          const d = data as Record<string, unknown>;
          if (event === "done") {
            const ok = d.ok as boolean;
            const msg = d.message as string;
            setFetching(false);
            queryClient.invalidateQueries({ queryKey: ["info"] });
            if (ok) {
              toast.success("Downloader installed successfully");
            } else {
              toast.error(msg || "Download failed");
            }
          }
        },
        onError() {
          setFetching(false);
          toast.error("Connection error");
        },
      },
      { method: "POST" }
    );
  };

  if (!missing) return null;

  return (
    <div className="flex flex-col gap-2 border-b bg-amber-500/15 px-4 py-3 text-amber-600 dark:text-amber-400 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <p className="text-sm">
          Hytale downloader not found. Server installs and updates are disabled
          until it is downloaded.
        </p>
      </div>
      <div className="flex gap-2">
        {onNavigateToSettings && (
          <Button
            variant="outline"
            size="sm"
            onClick={onNavigateToSettings}
          >
            Settings
          </Button>
        )}
        <Button
          size="sm"
          onClick={handleDownload}
          disabled={fetching}
          className="gap-1.5"
        >
          <Download className="h-3.5 w-3.5" />
          {fetching ? "Downloading…" : "Download now"}
        </Button>
      </div>
    </div>
  );
}
