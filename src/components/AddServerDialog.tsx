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
import { useCreateInstance } from "@/api/hooks/useInstances";
import { subscribeSSE } from "@/api/client";

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
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const createInstance = useCreateInstance();

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
    if (step === "installing") return; // Don't close during install
    setName("");
    setChannel("release");
    setStep("form");
    setProgress(0);
    setStatus("");
    setDetail("");
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
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
                placeholder="my-survival-server"
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
