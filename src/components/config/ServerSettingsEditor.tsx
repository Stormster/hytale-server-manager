import { useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info, Server } from "lucide-react";
import { useSettings, useUpdateSettings } from "@/api/hooks/useSettings";
import type { InstanceServerSettings } from "@/api/types";

function parseStartupArgs(args: string[]): {
  allowOp: boolean;
  assetsPath: string;
  authMode: "" | "authenticated" | "offline";
  customRaw: string;
} {
  const arr = args ?? [];
  let allowOp = false;
  let assetsPath = "";
  let authMode: "" | "authenticated" | "offline" = "";
  const rest: string[] = [];

  for (let i = 0; i < arr.length; i++) {
    const a = arr[i];
    if (a === "--allow-op") {
      allowOp = true;
    } else if (a === "--assets" && i + 1 < arr.length) {
      assetsPath = arr[i + 1] ?? "";
      i++;
    } else if (a === "--auth-mode" && i + 1 < arr.length) {
      const v = arr[i + 1];
      if (v === "authenticated" || v === "offline") authMode = v;
      i++;
    } else if (a) {
      rest.push(a);
    }
  }
  return { allowOp, assetsPath, authMode, customRaw: rest.join(" ") };
}

function buildStartupArgs(
  allowOp: boolean,
  assetsPath: string,
  authMode: string,
  customRaw: string
): string[] {
  const out: string[] = [];
  if (allowOp) out.push("--allow-op");
  if (assetsPath.trim()) out.push("--assets", assetsPath.trim());
  if (authMode) out.push("--auth-mode", authMode);
  const custom = customRaw.trim().split(/\s+/).filter(Boolean);
  out.push(...custom);
  return out;
}

export interface ServerSettingsEditorRef {
  save: () => void;
  isSaving: boolean;
}

interface ServerSettingsEditorProps {
  noFooter?: boolean;
  onSaveStateChange?: (isSaving: boolean) => void;
}

export const ServerSettingsEditor = forwardRef<
  ServerSettingsEditorRef | null,
  ServerSettingsEditorProps
>(function ServerSettingsEditor({ noFooter, onSaveStateChange }, ref) {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const activeInstance = settings?.active_instance ?? "";

  const instanceSettings = useMemo((): InstanceServerSettings => {
    const all = settings?.instance_server_settings ?? {};
    return all[activeInstance] ?? {};
  }, [settings?.instance_server_settings, activeInstance]);

  const parsed = useMemo(
    () => parseStartupArgs(instanceSettings.startup_args ?? []),
    [instanceSettings.startup_args]
  );

  const [ramUseCustom, setRamUseCustom] = useState(
    instanceSettings.ram_min_gb != null || instanceSettings.ram_max_gb != null
  );
  const [ramMin, setRamMin] = useState(
    String(instanceSettings.ram_min_gb ?? 4)
  );
  const [ramMax, setRamMax] = useState(
    String(instanceSettings.ram_max_gb ?? 8)
  );
  const [allowOp, setAllowOp] = useState(parsed.allowOp);
  const [assetsPath, setAssetsPath] = useState(parsed.assetsPath);
  const [authMode, setAuthMode] = useState(parsed.authMode);
  const [customRaw, setCustomRaw] = useState(parsed.customRaw);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    const hasRam = instanceSettings.ram_min_gb != null || instanceSettings.ram_max_gb != null;
    setRamUseCustom(hasRam);
    setRamMin(String(instanceSettings.ram_min_gb ?? 4));
    setRamMax(String(instanceSettings.ram_max_gb ?? 8));
    setAllowOp(parsed.allowOp);
    setAssetsPath(parsed.assetsPath);
    setAuthMode(parsed.authMode);
    setCustomRaw(parsed.customRaw);
  }, [instanceSettings, parsed]);

  const handleSave = useCallback(() => {
    if (!activeInstance) return;
    const startup_args = buildStartupArgs(allowOp, assetsPath, authMode, customRaw);
    updateSettings.mutate(
      {
        instance_name: activeInstance,
        instance_server_settings: {
          ram_min_gb: ramUseCustom ? (parseInt(ramMin, 10) || null) : null,
          ram_max_gb: ramUseCustom ? (parseInt(ramMax, 10) || null) : null,
          startup_args,
        },
      },
      {
        onSuccess: () => {
          setSaveMsg("Server settings saved");
          setTimeout(() => setSaveMsg(""), 3000);
        },
        onError: (err) => setSaveMsg(`Error: ${(err as Error).message}`),
      }
    );
  }, [
    activeInstance,
    allowOp,
    assetsPath,
    authMode,
    customRaw,
    ramMin,
    ramMax,
    ramUseCustom,
    updateSettings,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      save: handleSave,
      isSaving: updateSettings.isPending,
    }),
    [handleSave, updateSettings.isPending]
  );

  useEffect(() => {
    onSaveStateChange?.(updateSettings.isPending);
  }, [updateSettings.isPending, onSaveStateChange]);

  const effectiveArgs = useMemo(() => {
    type Arg = { text: string; required?: boolean };
    const parts: Arg[] = [];
    if (ramUseCustom) {
      const min = parseInt(ramMin, 10) || 4;
      const max = parseInt(ramMax, 10) || 8;
      parts.push({ text: `-Xms${min}G` }, { text: `-Xmx${max}G` });
    }
    parts.push(
      { text: "--assets", required: true },
      { text: assetsPath.trim() || "../Assets.zip", required: true }
    );
    parts.push({ text: "--bind", required: true }, { text: "0.0.0.0:<port>", required: true });
    parts.push({ text: "--accept-early-plugins", required: true });
    if (allowOp) parts.push({ text: "--allow-op" });
    if (authMode) parts.push({ text: "--auth-mode" }, { text: authMode });
    const custom = customRaw.trim().split(/\s+/).filter(Boolean);
    custom.forEach((c) => parts.push({ text: c }));
    return parts;
  }, [ramUseCustom, ramMin, ramMax, assetsPath, allowOp, authMode, customRaw]);

  if (!activeInstance) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        Select an instance to configure server settings.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Server settings</h3>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            These settings apply to the Java process and startup arguments. Changes take effect after restarting the server.
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="ram-custom" className="text-xs font-normal">
            RAM limits
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {ramUseCustom ? "Custom" : "Auto (Java default)"}
            </span>
            <Switch
              id="ram-custom"
              checked={ramUseCustom}
              onCheckedChange={setRamUseCustom}
            />
          </div>
        </div>
        {ramUseCustom && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ram-min" className="text-xs">Min (GB)</Label>
              <Input
                id="ram-min"
                type="number"
                min={1}
                max={128}
                value={ramMin}
                onChange={(e) => setRamMin(e.target.value)}
                className="h-8"
                placeholder="4"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ram-max" className="text-xs">Max (GB)</Label>
              <Input
                id="ram-max"
                type="number"
                min={1}
                max={128}
                value={ramMax}
                onChange={(e) => setRamMax(e.target.value)}
                className="h-8"
                placeholder="8"
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <Label className="text-xs">Startup arguments</Label>
        <p className="text-xs text-muted-foreground -mt-1">
          Applied on restart.
        </p>
        <div className="rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs">
          <div className="text-muted-foreground mb-1">Effective arguments:</div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            {effectiveArgs.map((arg, i) =>
              arg.required ? (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <span className="cursor-help text-foreground/90">{arg.text}</span>
                  </TooltipTrigger>
                  <TooltipContent>Required</TooltipContent>
                </Tooltip>
              ) : (
                <span key={i} className="text-foreground/90">
                  {arg.text}
                </span>
              )
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="allow-op" className="text-xs font-normal">--allow-op</Label>
          <Switch id="allow-op" checked={allowOp} onCheckedChange={setAllowOp} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="assets-path" className="text-xs">--assets (override)</Label>
          <Input
            id="assets-path"
            value={assetsPath}
            onChange={(e) => setAssetsPath(e.target.value)}
            placeholder="../Assets.zip"
            className="h-8 font-mono text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="auth-mode" className="text-xs">--auth-mode</Label>
          <Select
            value={authMode || "default"}
            onValueChange={(v) =>
              setAuthMode(v === "default" ? "" : (v as "authenticated" | "offline"))
            }
          >
            <SelectTrigger id="auth-mode" className="h-8">
              <SelectValue placeholder="Default (authenticated)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default (authenticated)</SelectItem>
              <SelectItem value="authenticated">authenticated</SelectItem>
              <SelectItem value="offline">offline</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="custom-args" className="text-xs">Custom arguments</Label>
          <Input
            id="custom-args"
            value={customRaw}
            onChange={(e) => setCustomRaw(e.target.value)}
            placeholder="e.g. --custom-flag value"
            className="h-8 font-mono text-xs"
          />
        </div>
      </div>

      {!noFooter && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            {saveMsg || "Changes apply after restart"}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSave}
            disabled={updateSettings.isPending}
          >
            {updateSettings.isPending ? "Saving..." : "Save server settings"}
          </Button>
        </div>
      )}
    </div>
  );
});
