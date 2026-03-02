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
import { useQueryClient } from "@tanstack/react-query";
import { useCreateInstance } from "@/api/hooks/useInstances";
import { toast } from "sonner";
import { subscribeSSE } from "@/api/client";

const STUCK_TIMEOUT_MS = 30_000; // 30 seconds with no progress = show Cancel

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddServerDialog({ open, onOpenChange }: Props) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("release");
  const [step, setStep] = useState<"form" | "installing" | "done">("form");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState("");
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [stuck, setStuck] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const abortRef = useRef<(() => void) | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const queryClient = useQueryClient();
  const createInstance = useCreateInstance();

  // Detect when stuck (no progress for 90s) and allow cancel
  useEffect(() => {
    if (step !== "installing") return;
    const iv = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= STUCK_TIMEOUT_MS) {
        setStuck(true);
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [step]);

  const handleCreate = async () => {
    if (!name.trim()) return;

    try {
      await createInstance.mutateAsync(name.trim());
    } catch (err) {
      setResult({ ok: false, message: (err as Error).message });
      setStep("done");
      return;
    }

    // Instance created and auto-activated. Now run setup.
    setStep("installing");
    setProgress(0);
    setStatus("Preparing...");
    setDetail("");
    setStatusLog([]);
    setStuck(false);
    lastActivityRef.current = Date.now();

    const { api } = await import("@/api/client");
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
            const ok = d.ok as boolean;
            setResult({
              ok,
              message: d.message as string,
            });
            setStep("done");
            if (ok) {
              setProgress(100);
              toast.success("Server installed");
              queryClient.invalidateQueries({ queryKey: ["instances"] });
              queryClient.invalidateQueries({ queryKey: ["updater", "all-instances"] });
              queryClient.invalidateQueries({ queryKey: ["updater", "local-status"] });
              queryClient.invalidateQueries({ queryKey: ["server", "status"] });
            } else {
              toast.error((d.message as string) || "Installation failed");
            }
          }
        },
        onError() {
          setResult({ ok: false, message: "Connection error" });
          toast.error("Connection error");
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
    setName("");
    setChannel("release");
    setStep("form");
    setProgress(0);
    setStatus("");
    setDetail("");
    setStatusLog([]);
    setStuck(false);
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Add New Server</DialogTitle>
          <DialogDescription>
            Create a new server instance. It will be set up in its own folder
            inside your servers directory.
          </DialogDescription>
        </DialogHeader>

        {step === "form" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="server-name">Instance Name</Label>
              <input
                id="server-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Survival Server"
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <Label>Update Channel</Label>
              <RadioGroup value={channel} onValueChange={setChannel}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="release" id="add-ch-release" />
                  <Label htmlFor="add-ch-release">
                    Release (recommended, stable)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="pre-release" id="add-ch-pre" />
                  <Label htmlFor="add-ch-pre">
                    Pre-Release (experimental)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {createInstance.isError && (
              <p className="text-sm text-red-500">
                {(createInstance.error as Error).message}
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!name.trim() || createInstance.isPending}
              >
                {createInstance.isPending
                  ? "Creating..."
                  : "Create & Install"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "installing" && (
          <div className="space-y-3 py-2">
            <p className="text-sm">{status}</p>
            <div className="flex items-center gap-3">
              <Progress value={progress} className="flex-1 h-3" />
              <span className="text-sm font-medium w-12 text-right">
                {Math.round(progress)}%
              </span>
            </div>
            {detail && (
              <p className="text-xs text-muted-foreground">{detail}</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={handleCancelInstall}>
                Cancel
              </Button>
            </DialogFooter>
            {stuck && (
              <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Taking longer than expected. Possible causes:
                </p>
                <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                  <li>Network or firewall blocking the download</li>
                  <li>Auth expired – try Refresh Auth in Settings</li>
                </ul>
                <div className="pt-1 flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={async () => {
                      try {
                        const { api } = await import("@/api/client");
                        const res = await api<{ logs: string }>("/api/debug/recent-logs");
                        const header = `--- Add server stuck, no output ---\nFrontend log: ${statusLog.join(" | ") || "(none)"}\n\nBackend logs:\n`;
                        await navigator.clipboard.writeText(header + (res?.logs ?? "(failed to fetch)"));
                        toast.success("Debug info copied");
                      } catch {
                        const header = `--- Add server stuck ---\nFrontend: ${statusLog.join(" | ") || "no output"}\n`;
                        await navigator.clipboard.writeText(header);
                        toast.success("Debug info copied");
                      }
                    }}
                  >
                    Copy debug info
                  </Button>
                  {statusLog.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(statusLog.join("\n"));
                        toast.success("Log copied");
                      }}
                    >
                      Copy frontend log
                    </Button>
                  )}
                </div>
                {statusLog.length > 0 ? (
                  <pre className="text-xs text-muted-foreground font-mono bg-background/50 rounded p-2 max-h-24 overflow-y-auto whitespace-pre-wrap break-words">
                    {statusLog.join("\n")}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground pt-1">
                    No output received. Copy debug info and share when reporting the issue.
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
