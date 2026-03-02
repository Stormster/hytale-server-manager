import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LogConsole } from "@/components/LogConsole";
import { parseAuthOutput } from "@/lib/authOutput";
import { ExternalLink, Copy, ChevronDown, ChevronUp } from "lucide-react";

interface AuthFlowDisplayProps {
  lines: string[];
  className?: string;
}

export function AuthFlowDisplay({ lines, className }: AuthFlowDisplayProps) {
  const [showConsole, setShowConsole] = useState(false);
  const parsed = parseAuthOutput(lines);

  const handleOpenUrl = async () => {
    if (!parsed.authUrl) return;
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(parsed.authUrl);
    } catch {
      try {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(parsed.authUrl);
      } catch {
        window.open(parsed.authUrl, "_blank", "noopener");
      }
    }
  };

  const handleCopyUrl = async () => {
    if (!parsed.authUrl) return;
    try {
      await navigator.clipboard.writeText(parsed.authUrl);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleCopyCode = async () => {
    if (!parsed.code) return;
    try {
      await navigator.clipboard.writeText(parsed.code);
      toast.success("Code copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className={className}>
      {/* Parsed OAuth UI */}
      {(parsed.authUrl || parsed.code) && (
        <div className="rounded-lg border border-border bg-card/80 p-4 space-y-3">
          {parsed.authUrl && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Visit this link to sign in:</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 justify-start gap-2 font-normal text-left truncate min-w-0 cursor-pointer"
                  onClick={handleOpenUrl}
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{parsed.authUrl}</span>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyUrl}
                  title="Copy link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          {parsed.code && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Or enter this code at{" "}
                {parsed.baseUrl ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const { openUrl } = await import(
                          "@tauri-apps/plugin-opener"
                        );
                        await openUrl(parsed.baseUrl!);
                      } catch {
                        const { open } = await import(
                          "@tauri-apps/plugin-shell"
                        );
                        await open(parsed.baseUrl!);
                      }
                    }}
                    className="text-primary hover:underline cursor-pointer font-medium"
                  >
                    oauth.accounts.hytale.com
                  </button>
                ) : (
                  "the login page"
                )}
                :
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded border border-input bg-input px-3 py-2 text-lg font-mono tracking-wider text-foreground">
                  {parsed.code}
                </code>
                <Button variant="outline" size="icon" onClick={handleCopyCode}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapsible console */}
      <div className="space-y-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-muted-foreground hover:text-foreground"
          onClick={() => setShowConsole(!showConsole)}
        >
          {showConsole ? (
            <ChevronUp className="h-4 w-4 mr-1" />
          ) : (
            <ChevronDown className="h-4 w-4 mr-1" />
          )}
          {showConsole ? "Hide" : "Show"} console
        </Button>
        {showConsole && (
          <LogConsole lines={lines} className="h-[140px]" />
        )}
      </div>
    </div>
  );
}
