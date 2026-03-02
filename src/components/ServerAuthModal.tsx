import { useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ExternalLink, Copy, Loader2, CheckCircle2 } from "lucide-react";
import { api } from "@/api/client";

const AUTH_NEEDED = /no server tokens configured/i;
const OAUTH_URL_RE = /https:\/\/oauth\.accounts\.hytale\.com\/[^\s<>"{}|\\^`[\]]+/;
const AUTH_SUCCESS = /authentication successful/i;
const PERSISTENCE_DONE =
  /credential storage changed to:\s*\w+|swapped credential store to:\s*\w+/i;

interface ServerAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: string[];
  running: boolean;
}

export function ServerAuthModal({
  open,
  onOpenChange,
  lines,
  running,
}: ServerAuthModalProps) {
  const sentLoginRef = useRef(false);
  const sentPersistenceRef = useRef(false);

  const allText = lines.join("\n");
  const authNeeded = AUTH_NEEDED.test(allText);
  const oauthUrl = (() => {
    const m = allText.match(OAUTH_URL_RE);
    return m ? m[0] : null;
  })();
  const authSuccess = AUTH_SUCCESS.test(allText);
  const persistenceDone = PERSISTENCE_DONE.test(allText);

  const sendCommand = async (cmd: string) => {
    if (!running) return;
    try {
      await api("/api/server/command", {
        method: "POST",
        body: JSON.stringify({ command: cmd + "\n" }),
      });
    } catch {
      // Ignore
    }
  };

  // When modal opens, send /auth login Browser
  useEffect(() => {
    if (!open || !running || sentLoginRef.current) return;
    sentLoginRef.current = true;
    sendCommand("/auth login Browser");
  }, [open, running]);

  // When auth success detected, send /auth persistence Encrypted
  useEffect(() => {
    if (!open || !running || !authSuccess || sentPersistenceRef.current) return;
    sentPersistenceRef.current = true;
    sendCommand("/auth persistence Encrypted");
  }, [open, running, authSuccess]);

  // Reset refs when modal closes (for next time)
  useEffect(() => {
    if (!open) {
      sentLoginRef.current = false;
      sentPersistenceRef.current = false;
    }
  }, [open]);

  const handleOpenUrl = async () => {
    if (!oauthUrl) return;
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(oauthUrl);
    } catch {
      try {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(oauthUrl);
      } catch {
        window.open(oauthUrl, "_blank", "noopener");
      }
    }
  };

  const handleCopyUrl = async () => {
    if (!oauthUrl) return;
    try {
      await navigator.clipboard.writeText(oauthUrl);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg overflow-hidden">
        <DialogHeader>
          <DialogTitle>Server authentication required</DialogTitle>
          <DialogDescription>
            {persistenceDone
              ? "Your server credentials are now saved. You can close this dialog."
              : authSuccess
                ? "Saving credentials to secure storage..."
                : oauthUrl
                  ? "Open the link below in your browser to sign in with your Hytale account."
                  : "Starting login flow. A link will appear shortly—open it in your browser to authenticate."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 min-w-0 overflow-hidden">
          {oauthUrl && !persistenceDone && (
            <div className="space-y-2 min-w-0">
              <p className="text-sm font-medium">Sign in via browser:</p>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0 overflow-hidden rounded-md border border-input bg-background px-3 py-2 flex items-center">
                  <span
                    className="text-sm font-mono text-foreground truncate block"
                    title={oauthUrl}
                  >
                    {oauthUrl}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={handleOpenUrl}
                  title="Open in browser"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={handleCopyUrl}
                  title="Copy link"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              {!authSuccess && (
                <p className="text-xs text-muted-foreground">
                  Complete the sign-in in your browser, then return here.
                </p>
              )}
            </div>
          )}

          {authSuccess && !persistenceDone && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              Saving credentials...
            </div>
          )}

          {persistenceDone && (
            <div className="flex items-center gap-2 text-emerald-500">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>Credentials saved successfully.</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            {persistenceDone ? "Done" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
