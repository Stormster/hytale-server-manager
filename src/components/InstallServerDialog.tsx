import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { subscribeSSE } from "@/api/client";

const STUCK_TIMEOUT_MS = 30_000;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function InstallServerDialog({
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const [channel, setChannel] = useState("release");
  const [step, setStep] = useState<"form" | "installing" | "done">("form");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState("");
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [stuck, setStuck] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    if (step !== "installing") return;
    const iv = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= STUCK_TIMEOUT_MS) {
        setStuck(true);
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [step]);

  const handleInstall = async () => {
    setStep("installing");
    setProgress(0);
    setStatus("Preparing...");
    setDetail("");
    setResult(null);
    setStatusLog([]);
    setStuck(false);
    lastActivityRef.current = Date.now();

    const { api } = await import("@/api/client");
    try {
      await api("/api/health");
    } catch {
      setResult({ ok: false, message: "Unable to connect. Please try again." });
      setStep("done");
      return;
    }

    setStatus("Checking setup...");
    const ready = await api<{ ok: boolean; error?: string }>("/api/updater/setup-ready");
    if (!ready.ok && ready.error) {
      setResult({ ok: false, message: ready.error });
      setStep("done");
      return;
    }

    setStatus("Starting installation...");
    abortRef.current = subscribeSSE(
      `/api/updater/setup?patchline=${channel}`,
      {
        onEvent(event, data) {
          lastActivityRef.current = Date.now();
          const d = data as Record<string, unknown>;
          if (event === "status") {
            const msg = d.message as string;
            setStatus(msg);
            setStatusLog((prev) => [...prev, msg]);
          } else if (event === "progress") {
            setProgress(d.percent as number);
            setDetail(d.detail as string);
          } else if (event === "done") {
            setResult({
              ok: d.ok as boolean,
              message: d.message as string,
            });
            setStep("done");
            if (d.ok) setProgress(100);
          }
        },
        onError() {
          setResult({ ok: false, message: "Connection error" });
          setStep("done");
        },
      },
      { method: "POST" }
    );
  };

  const handleCancelInstall = () => {
    abortRef.current?.();
    abortRef.current = null;
    toast.info("Installation cancelled.");
    handleClose();
  };

  const handleClose = () => {
    abortRef.current?.();
    abortRef.current = null;
    const wasOk = result?.ok;
    setChannel("release");
    setStep("form");
    setProgress(0);
    setStatus("");
    setDetail("");
    setStatusLog([]);
    setStuck(false);
    setResult(null);
    if (wasOk) onSuccess?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Install Server</DialogTitle>
          <DialogDescription>
            Download and install the Hytale server for this instance. Choose
            your update channel.
          </DialogDescription>
        </DialogHeader>

        {step === "form" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Update Channel</Label>
              <RadioGroup value={channel} onValueChange={setChannel}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="release" id="install-ch-release" />
                  <Label htmlFor="install-ch-release">
                    Release (recommended, stable)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="pre-release" id="install-ch-pre" />
                  <Label htmlFor="install-ch-pre">
                    Pre-Release (experimental)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleInstall}>Install</Button>
            </DialogFooter>
          </div>
        )}

        {step === "installing" && (
          <div className="space-y-3 py-2">
            <p className="text-sm">
              {detail ? (
                <>
                  {status}
                  {status && " — "}
                  <span className="text-muted-foreground">{detail}</span>
                </>
              ) : (
                status || "Preparing..."
              )}
            </p>
            <div className="flex items-center gap-3">
              <Progress value={progress} className="flex-1 h-3" />
              <span className="text-sm font-medium w-12 text-right">
                {Math.round(progress)}%
              </span>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCancelInstall}>
                Cancel
              </Button>
            </DialogFooter>
            {stuck && (
              <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 space-y-2">
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Taking longer than expected. Possible causes:
                </p>
                <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                  <li>Network or firewall blocking the download</li>
                  <li>Auth expired – try Refresh Auth in Settings</li>
                  <li>On Linux/WSL: progress may not show. Try cancelling and running again</li>
                </ul>
                {statusLog.length > 0 ? (
                  <div className="pt-1">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Log:</p>
                    <pre className="text-xs text-muted-foreground font-mono bg-background/50 rounded p-2 max-h-24 overflow-y-auto whitespace-pre-wrap break-words">
                      {statusLog.join("\n")}
                    </pre>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-7 text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(statusLog.join("\n"));
                        toast.success("Log copied");
                      }}
                    >
                      Copy log
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground pt-1">
                    No output received. Please try again.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-3 py-2">
            <p
              className={`text-sm font-medium ${
                result.ok ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {result.message}
            </p>
            <DialogFooter>
              <Button onClick={handleClose}>
                {result.ok ? "Done" : "Close"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
