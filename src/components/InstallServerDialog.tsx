import { useState } from "react";
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
import { subscribeSSE } from "@/api/client";

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

  const handleInstall = () => {
    setStep("installing");
    setProgress(0);
    setStatus("Preparing...");
    setDetail("");
    setResult(null);

    subscribeSSE(
      `/api/updater/setup?patchline=${channel}`,
      {
        onEvent(event, data) {
          const d = data as Record<string, unknown>;
          if (event === "status") {
            setStatus(d.message as string);
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

  const handleClose = () => {
    if (step === "installing") return;
    const wasOk = result?.ok;
    setChannel("release");
    setStep("form");
    setProgress(0);
    setStatus("");
    setDetail("");
    setResult(null);
    if (wasOk) onSuccess?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
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
