import { useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle, type ForwardedRef } from "react";
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
import { ChevronDown, ChevronRight, Info, Server } from "lucide-react";
import { useSettings, useUpdateSettings } from "@/api/hooks/useSettings";
import type { InstanceServerSettings } from "@/api/types";

type ParsedArgs = {
  allowOp: boolean;
  assetsPath: string;
  authMode: "" | "authenticated" | "offline" | "insecure";
  backup: boolean;
  backupDir: string;
  backupFrequency: string;
  backupMaxCount: string;
  backupArchiveMaxCount: string;
  bare: boolean;
  bootCommand: string;
  disableAssetCompare: boolean;
  disableCpbBuild: boolean;
  disableFileWatcher: boolean;
  disableSentry: boolean;
  earlyPlugins: string;
  eventDebug: boolean;
  forceNetworkFlush: string;
  mods: string;
  singleplayer: boolean;
  skipModValidation: boolean;
  transport: string;
  universe: string;
  validateAssets: boolean;
  validatePrefabs: boolean;
  validateWorldGen: boolean;
  worldGen: string;
  customRaw: string;
};

function parseStartupArgs(args: string[]): ParsedArgs {
  const arr = args ?? [];
  const result: ParsedArgs = {
    allowOp: false,
    assetsPath: "",
    authMode: "",
    backup: false,
    backupDir: "",
    backupFrequency: "30",
    backupMaxCount: "5",
    backupArchiveMaxCount: "5",
    bare: false,
    bootCommand: "",
    disableAssetCompare: false,
    disableCpbBuild: false,
    disableFileWatcher: false,
    disableSentry: false,
    earlyPlugins: "",
    eventDebug: false,
    forceNetworkFlush: "",
    mods: "",
    singleplayer: false,
    skipModValidation: false,
    transport: "",
    universe: "",
    validateAssets: false,
    validatePrefabs: false,
    validateWorldGen: false,
    worldGen: "",
    customRaw: "",
  };

  const extractVal = (name: string): string | null => {
    const i = arr.indexOf(name);
    return i >= 0 && i + 1 < arr.length ? arr[i + 1] : null;
  };
  const hasFlag = (name: string) => arr.includes(name);

  result.allowOp = hasFlag("--allow-op");
  result.assetsPath = extractVal("--assets") ?? "";
  const am = extractVal("--auth-mode");
  if (am === "authenticated" || am === "offline" || am === "insecure") result.authMode = am;
  result.backup = hasFlag("--backup");
  result.backupDir = extractVal("--backup-dir") ?? "";
  result.backupFrequency = extractVal("--backup-frequency") ?? "30";
  result.backupMaxCount = extractVal("--backup-max-count") ?? "5";
  result.backupArchiveMaxCount = extractVal("--backup-archive-max-count") ?? "5";
  result.bare = hasFlag("--bare");
  result.bootCommand = extractVal("--boot-command") ?? "";
  result.disableAssetCompare = hasFlag("--disable-asset-compare");
  result.disableCpbBuild = hasFlag("--disable-cpb-build");
  result.disableFileWatcher = hasFlag("--disable-file-watcher");
  result.disableSentry = hasFlag("--disable-sentry");
  result.earlyPlugins = extractVal("--early-plugins") ?? "";
  result.eventDebug = hasFlag("--event-debug");
  result.forceNetworkFlush = extractVal("--force-network-flush") ?? "";
  result.mods = extractVal("--mods") ?? "";
  result.singleplayer = hasFlag("--singleplayer");
  result.skipModValidation = hasFlag("--skip-mod-validation");
  result.transport = extractVal("-t") ?? extractVal("--transport") ?? "";
  result.universe = extractVal("--universe") ?? "";
  result.validateAssets = hasFlag("--validate-assets");
  result.validatePrefabs = hasFlag("--validate-prefabs");
  result.validateWorldGen = hasFlag("--validate-world-gen");
  result.worldGen = extractVal("--world-gen") ?? "";

  // Collect unrecognized args into customRaw
  const knownWithValue = new Set([
    "--assets", "--auth-mode", "--backup-dir", "--backup-frequency", "--backup-max-count",
    "--backup-archive-max-count", "--boot-command", "--early-plugins", "--force-network-flush",
    "-t", "--transport", "--mods", "--universe", "--world-gen",
  ]);
  const rest: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i];
    if (knownWithValue.has(a)) {
      i++; // skip value
    } else if (
      a === "--allow-op" || a === "--backup" || a === "--bare" || a === "--disable-asset-compare" ||
      a === "--disable-cpb-build" || a === "--disable-file-watcher" || a === "--disable-sentry" ||
      a === "--event-debug" || a === "--singleplayer" || a === "--skip-mod-validation" ||
      a === "--validate-assets" || a === "--validate-prefabs" || a === "--validate-world-gen"
    ) {
      // known flag, skip
    } else if (a) {
      rest.push(a);
      if (i + 1 < arr.length && !arr[i + 1].startsWith("-")) {
        rest.push(arr[i + 1]);
        i++;
      }
    }
  }
  result.customRaw = rest.join(" ");
  return result;
}

function buildStartupArgs(p: ParsedArgs): string[] {
  const out: string[] = [];
  if (p.allowOp) out.push("--allow-op");
  if (p.assetsPath.trim()) out.push("--assets", p.assetsPath.trim());
  if (p.authMode) out.push("--auth-mode", p.authMode);
  if (p.backup) out.push("--backup");
  if (p.backupDir.trim()) out.push("--backup-dir", p.backupDir.trim());
  if (p.backupFrequency.trim()) out.push("--backup-frequency", p.backupFrequency.trim());
  if (p.backupMaxCount.trim()) out.push("--backup-max-count", p.backupMaxCount.trim());
  if (p.backupArchiveMaxCount.trim()) out.push("--backup-archive-max-count", p.backupArchiveMaxCount.trim());
  if (p.bare) out.push("--bare");
  if (p.bootCommand.trim()) out.push("--boot-command", p.bootCommand.trim());
  if (p.disableAssetCompare) out.push("--disable-asset-compare");
  if (p.disableCpbBuild) out.push("--disable-cpb-build");
  if (p.disableFileWatcher) out.push("--disable-file-watcher");
  if (p.disableSentry) out.push("--disable-sentry");
  if (p.earlyPlugins.trim()) out.push("--early-plugins", p.earlyPlugins.trim());
  if (p.eventDebug) out.push("--event-debug");
  if (p.forceNetworkFlush.trim()) out.push("--force-network-flush", p.forceNetworkFlush.trim());
  if (p.mods.trim()) out.push("--mods", p.mods.trim());
  if (p.singleplayer) out.push("--singleplayer");
  if (p.skipModValidation) out.push("--skip-mod-validation");
  if (p.transport.trim()) out.push("--transport", p.transport.trim());
  if (p.universe.trim()) out.push("--universe", p.universe.trim());
  if (p.validateAssets) out.push("--validate-assets");
  if (p.validatePrefabs) out.push("--validate-prefabs");
  if (p.validateWorldGen) out.push("--validate-world-gen");
  if (p.worldGen.trim()) out.push("--world-gen", p.worldGen.trim());
  const custom = p.customRaw.trim().split(/\s+/).filter(Boolean);
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

const ServerSettingsEditorBase = forwardRef(function ServerSettingsEditor(
  { noFooter, onSaveStateChange }: ServerSettingsEditorProps,
  ref: ForwardedRef<ServerSettingsEditorRef | null>
) {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const activeInstance = settings?.active_instance ?? "";
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

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
  const [ramMin, setRamMin] = useState(String(instanceSettings.ram_min_gb ?? 4));
  const [ramMax, setRamMax] = useState(String(instanceSettings.ram_max_gb ?? 8));
  const [form, setForm] = useState<ParsedArgs>(parsed);

  useEffect(() => {
    const hasRam = instanceSettings.ram_min_gb != null || instanceSettings.ram_max_gb != null;
    setRamUseCustom(hasRam);
    setRamMin(String(instanceSettings.ram_min_gb ?? 4));
    setRamMax(String(instanceSettings.ram_max_gb ?? 8));
    setForm(parsed);
  }, [instanceSettings, parsed]);

  const handleSave = useCallback(() => {
    if (!activeInstance) return;
    const startup_args = buildStartupArgs(form);
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
  }, [activeInstance, form, ramMin, ramMax, ramUseCustom, updateSettings]);

  useImperativeHandle(
    ref,
    () => ({ save: handleSave, isSaving: updateSettings.isPending }),
    [handleSave, updateSettings.isPending]
  );

  useEffect(() => {
    onSaveStateChange?.(updateSettings.isPending);
  }, [updateSettings.isPending, onSaveStateChange]);

  const effectiveArgs = useMemo(() => {
    type Arg = { text: string; required?: boolean; tooltip?: string };
    const parts: Arg[] = [];
    if (ramUseCustom) {
      const min = parseInt(ramMin, 10) || 4;
      const max = parseInt(ramMax, 10) || 8;
      parts.push({ text: `-Xms${min}G` }, { text: `-Xmx${max}G` });
    }
    parts.push(
      { text: "--assets", required: true, tooltip: "Asset directory (default: ..\\HytaleAssets)" },
      { text: form.assetsPath.trim() || "../Assets.zip", required: true }
    );
    parts.push(
      { text: "--bind", required: true, tooltip: "Port to listen on (default: 0.0.0.0:5520)" },
      { text: "0.0.0.0:<port>", required: true }
    );
    parts.push({
      text: "--accept-early-plugins",
      required: true,
      tooltip: "Loading early plugins is unsupported and may cause stability issues.",
    });
    const userArgs = buildStartupArgs(form);
    userArgs.forEach((a) => parts.push({ text: a }));
    return parts;
  }, [ramUseCustom, ramMin, ramMax, form]);

  const update = (updates: Partial<ParsedArgs>) => setForm((f) => ({ ...f, ...updates }));

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
          <Label htmlFor="ram-custom" className="text-xs font-normal">RAM limits</Label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {ramUseCustom ? "Custom" : "Auto (Java default)"}
            </span>
            <Switch id="ram-custom" checked={ramUseCustom} onCheckedChange={setRamUseCustom} />
          </div>
        </div>
        {ramUseCustom && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ram-min" className="text-xs">Min (GB)</Label>
              <Input id="ram-min" type="number" min={1} max={128} value={ramMin} onChange={(e) => setRamMin(e.target.value)} className="h-8" placeholder="4" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ram-max" className="text-xs">Max (GB)</Label>
              <Input id="ram-max" type="number" min={1} max={128} value={ramMax} onChange={(e) => setRamMax(e.target.value)} className="h-8" placeholder="8" />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <Label className="text-xs">Startup arguments</Label>
        <p className="text-xs text-muted-foreground -mt-1">Applied on restart.</p>
        <div className="rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs">
          <div className="text-muted-foreground mb-1">Effective arguments:</div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            {effectiveArgs.map((arg, i) => {
              const tip = arg.tooltip ?? (arg.required ? "Required" : null);
              return tip ? (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <span className="cursor-help text-foreground/90">{arg.text}</span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">{tip}</TooltipContent>
                </Tooltip>
              ) : (
                <span key={i} className="text-foreground/90">{arg.text}</span>
              );
            })}
          </div>
        </div>

        {/* Common args */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label htmlFor="allow-op" className="text-xs font-normal cursor-help">--allow-op</Label>
                <Switch id="allow-op" checked={form.allowOp} onCheckedChange={(c) => update({ allowOp: c })} />
              </div>
            </TooltipTrigger>
            <TooltipContent>Allow operator commands</TooltipContent>
          </Tooltip>

          <div className="space-y-1.5 sm:col-span-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Label htmlFor="assets-path" className="text-xs cursor-help">--assets</Label>
              </TooltipTrigger>
              <TooltipContent>Asset directory (default: ..\HytaleAssets)</TooltipContent>
            </Tooltip>
            <Input
              id="assets-path"
              value={form.assetsPath}
              onChange={(e) => update({ assetsPath: e.target.value })}
              placeholder="../Assets.zip"
              className="h-8 font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Label htmlFor="auth-mode" className="text-xs cursor-help">--auth-mode</Label>
              </TooltipTrigger>
              <TooltipContent>Authentication mode (default: AUTHENTICATED)</TooltipContent>
            </Tooltip>
            <Select
              value={form.authMode || "default"}
              onValueChange={(v) => update({ authMode: v === "default" ? "" : (v as ParsedArgs["authMode"]) })}
            >
              <SelectTrigger id="auth-mode" className="h-8">
                <SelectValue placeholder="Default (authenticated)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default (authenticated)</SelectItem>
                <SelectItem value="authenticated">authenticated</SelectItem>
                <SelectItem value="offline">offline</SelectItem>
                <SelectItem value="insecure">insecure</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-3 rounded-md border border-border/60 p-3">
          <Label className="text-xs">Backup</Label>
          <p className="text-xs text-muted-foreground -mt-1">
            Backups run automatically by default—no flag needed. Defaults: every 30 min, 5 backups kept, 5 archived. Use --backup to explicitly enable; the options below customize those defaults.
          </p>
          <div className="flex items-center justify-between">
            <Label className="text-xs font-normal">--backup</Label>
            <Switch checked={form.backup} onCheckedChange={(c) => update({ backup: c })} />
          </div>
          {form.backup && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="backup-dir" className="text-xs">--backup-dir</Label>
                <Input id="backup-dir" value={form.backupDir} onChange={(e) => update({ backupDir: e.target.value })} placeholder="Uses default path if empty" className="h-8 font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="backup-frequency" className="text-xs cursor-help">--backup-frequency</Label>
                  </TooltipTrigger>
                  <TooltipContent>Minutes between backups (default: 30)</TooltipContent>
                </Tooltip>
                <Input id="backup-frequency" type="number" min={1} value={form.backupFrequency} onChange={(e) => update({ backupFrequency: e.target.value })} className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="backup-max-count" className="text-xs cursor-help">--backup-max-count</Label>
                  </TooltipTrigger>
                  <TooltipContent>Max backups to keep (default: 5)</TooltipContent>
                </Tooltip>
                <Input id="backup-max-count" type="number" min={1} value={form.backupMaxCount} onChange={(e) => update({ backupMaxCount: e.target.value })} className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="backup-archive-max-count" className="text-xs cursor-help">--backup-archive-max-count</Label>
                  </TooltipTrigger>
                  <TooltipContent>Max archived backups (default: 5)</TooltipContent>
                </Tooltip>
                <Input id="backup-archive-max-count" type="number" min={1} value={form.backupArchiveMaxCount} onChange={(e) => update({ backupArchiveMaxCount: e.target.value })} className="h-8" />
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1"
        >
          {advancedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Advanced
        </button>

        {advancedOpen && (
          <div className="space-y-3 rounded-md border border-border/60 p-3">
            <p className="text-xs text-muted-foreground">Rarely used options. Changes apply after restart.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-normal cursor-help">--bare</Label>
                    <Switch checked={form.bare} onCheckedChange={(c) => update({ bare: c })} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Run without loading worlds, binding ports, or creating directories</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-normal cursor-help">--singleplayer</Label>
                    <Switch checked={form.singleplayer} onCheckedChange={(c) => update({ singleplayer: c })} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Singleplayer mode</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-normal cursor-help">--skip-mod-validation</Label>
                    <Switch checked={form.skipModValidation} onCheckedChange={(c) => update({ skipModValidation: c })} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Skip mod validation to allow boot even if one fails</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-normal cursor-help">--disable-asset-compare</Label>
                    <Switch checked={form.disableAssetCompare} onCheckedChange={(c) => update({ disableAssetCompare: c })} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Disable asset comparison</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-normal cursor-help">--disable-cpb-build</Label>
                    <Switch checked={form.disableCpbBuild} onCheckedChange={(c) => update({ disableCpbBuild: c })} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Disable compact prefab buffer building</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-normal cursor-help">--disable-file-watcher</Label>
                    <Switch checked={form.disableFileWatcher} onCheckedChange={(c) => update({ disableFileWatcher: c })} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Disable file watching</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-normal cursor-help">--disable-sentry</Label>
                    <Switch checked={form.disableSentry} onCheckedChange={(c) => update({ disableSentry: c })} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Disable Sentry error reporting</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-normal cursor-help">--event-debug</Label>
                    <Switch checked={form.eventDebug} onCheckedChange={(c) => update({ eventDebug: c })} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Enable event debugging</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-normal cursor-help">--validate-assets</Label>
                    <Switch checked={form.validateAssets} onCheckedChange={(c) => update({ validateAssets: c })} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Exit with error if assets are invalid</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-normal cursor-help">--validate-prefabs</Label>
                    <Switch checked={form.validatePrefabs} onCheckedChange={(c) => update({ validatePrefabs: c })} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Exit with error if prefabs are invalid</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-normal cursor-help">--validate-world-gen</Label>
                    <Switch checked={form.validateWorldGen} onCheckedChange={(c) => update({ validateWorldGen: c })} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Exit with error if default world gen is invalid</TooltipContent>
              </Tooltip>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="boot-command" className="text-xs cursor-help">--boot-command</Label>
                  </TooltipTrigger>
                  <TooltipContent>Run command on boot (executed synchronously)</TooltipContent>
                </Tooltip>
                <Input id="boot-command" value={form.bootCommand} onChange={(e) => update({ bootCommand: e.target.value })} placeholder="Command" className="h-8 font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="early-plugins" className="text-xs">--early-plugins</Label>
                <Input id="early-plugins" value={form.earlyPlugins} onChange={(e) => update({ earlyPlugins: e.target.value })} placeholder="Path" className="h-8 font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mods" className="text-xs">--mods</Label>
                <Input id="mods" value={form.mods} onChange={(e) => update({ mods: e.target.value })} placeholder="Additional mods directory" className="h-8 font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="universe" className="text-xs">--universe</Label>
                <Input id="universe" value={form.universe} onChange={(e) => update({ universe: e.target.value })} placeholder="Path" className="h-8 font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="world-gen" className="text-xs">--world-gen</Label>
                <Input id="world-gen" value={form.worldGen} onChange={(e) => update({ worldGen: e.target.value })} placeholder="World gen directory" className="h-8 font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="transport" className="text-xs cursor-help">-t, --transport</Label>
                  </TooltipTrigger>
                  <TooltipContent>Transport type (default: QUIC)</TooltipContent>
                </Tooltip>
                <Input id="transport" value={form.transport} onChange={(e) => update({ transport: e.target.value })} placeholder="QUIC" className="h-8 font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="force-network-flush" className="text-xs cursor-help">--force-network-flush</Label>
                  </TooltipTrigger>
                  <TooltipContent>Force network flush (default: true)</TooltipContent>
                </Tooltip>
                <Input id="force-network-flush" value={form.forceNetworkFlush} onChange={(e) => update({ forceNetworkFlush: e.target.value })} placeholder="true" className="h-8 font-mono text-xs" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="custom-args" className="text-xs">Custom arguments</Label>
              <Input
                id="custom-args"
                value={form.customRaw}
                onChange={(e) => update({ customRaw: e.target.value })}
                placeholder="e.g. --identity-token <token> --owner-name <name>"
                className="h-8 font-mono text-xs"
              />
            </div>
          </div>
        )}
      </div>

      {!noFooter && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">{saveMsg || "Changes apply after restart"}</span>
          <Button size="sm" variant="outline" onClick={handleSave} disabled={updateSettings.isPending}>
            {updateSettings.isPending ? "Saving..." : "Save server settings"}
          </Button>
        </div>
      )}
    </div>
  );
});

export { ServerSettingsEditorBase as ServerSettingsEditor };
