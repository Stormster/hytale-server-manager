import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useQueryClient } from "@tanstack/react-query";
import { useMods, useToggleMod, useUploadMods, useNitradoUpdateStatus } from "@/api/hooks/useMods";
import { useServerStatus } from "@/api/hooks/useServer";
import { useSettings } from "@/api/hooks/useSettings";
import { Lock, Download, FolderOpen, Info, Code2, Palette, ChevronDown, ChevronUp, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/api/client";
import { toast } from "sonner";
import { openPathInExplorer } from "@/lib/openPath";
import type { Mod } from "@/api/types";

const REQUIRED_PREFIXES = ["nitrado-webserver", "nitrado-query"];

function hasRequiredMods(mods: { name: string }[]): boolean {
  const lower = (s: string) => s.toLowerCase();
  return REQUIRED_PREFIXES.every(
    (p) => mods.some((m) => lower(m.name).startsWith(p))
  );
}

const MOD_TYPE_CONFIG: Record<
  "plugin" | "pack" | "plugin_pack",
  { label: string; icon: typeof Code2; className: string; title: string }
> = {
  plugin: {
    label: "Plugin",
    icon: Code2,
    className: "bg-muted text-muted-foreground",
    title: "Plugin only — mechanics, commands, QoL",
  },
  pack: {
    label: "Pack",
    icon: Palette,
    className: "bg-emerald-500/25 text-emerald-400 border border-emerald-500/30",
    title: "Asset Pack only — textures, models, sounds, behavior definitions",
  },
  plugin_pack: {
    label: "Plugin + Pack",
    icon: Palette,
    className: "bg-emerald-500/25 text-emerald-400 border border-emerald-500/30",
    title: "Plugin with bundled Asset Pack — custom blocks, items, models, mechanics",
  },
};

function ModTypeBadge({ mod }: { mod: Mod }) {
  const type = mod.modType || "plugin";
  const config = MOD_TYPE_CONFIG[type];
  const Icon = config.icon;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium", config.className)}
      title={config.title}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function ModCard({
  mod,
  running,
  toggleMod,
  getModFolderPath,
  openPathInExplorer,
}: {
  mod: Mod;
  running: boolean;
  toggleMod: ReturnType<typeof useToggleMod>;
  getModFolderPath: (path: string) => string;
  openPathInExplorer: (path: string) => void;
}) {
  return (
    <Card className={cn(!mod.enabled && "opacity-70")}>
      <CardContent className="flex items-center justify-between gap-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium truncate" title={mod.name}>{mod.displayName ?? mod.name}</span>
            <ModTypeBadge mod={mod} />
            {mod.required && (
              <span title="Required – cannot be disabled">
                <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {mod.enabled ? "Enabled" : "Disabled"}
            {mod.dataFolder != null && mod.dataFolderExists && (
              <>
                {" · "}
                <span title="Config/data folder">
                  mods/{mod.dataFolder}
                </span>
              </>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={() => openPathInExplorer(getModFolderPath(mod.path))}
            title="Open folder in File Explorer"
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
          <Switch
            checked={mod.enabled}
            disabled={mod.required || running || toggleMod.isPending}
            onCheckedChange={(checked) => {
              if (mod.required) return;
              toggleMod.mutate({ path: mod.path, enabled: checked });
            }}
            title={
              mod.required
                ? "Required mod – cannot be disabled"
                : running
                  ? "Stop the server first"
                  : undefined
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function ModsView() {
  const { data: settings } = useSettings();
  const { data: modsData, isLoading, refetch } = useMods();
  const { data: nitradoUpdate } = useNitradoUpdateStatus();
  const { data: serverStatus } = useServerStatus();
  const queryClient = useQueryClient();
  const toggleMod = useToggleMod();
  const uploadMods = useUploadMods();
  const [installing, setInstalling] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeInstance = settings?.active_instance;
  const rootDir = (settings?.root_dir || "").replace(/[/\\]+$/, "");
  const sep = rootDir.includes("\\") ? "\\" : "/";
  const modsPath = activeInstance && rootDir ? [rootDir, activeInstance, "Server", "mods"].join(sep) : "";
  const running = serverStatus?.running ?? false;

  const handleOpenFolder = () => openPathInExplorer(modsPath);

  const getModFolderPath = (modPath: string) => {
    if (!activeInstance || !rootDir) return "";
    const dirPart = modPath.includes("/") ? modPath.replace(/\/[^/]*$/, "") : "mods";
    const parts = dirPart.split("/");
    return [rootDir, activeInstance, "Server", ...parts].join(sep);
  };
  const mods = modsData?.mods ?? [];
  const regularMods = mods.filter((m) => !m.required);
  const requiredMods = mods.filter((m) => m.required);
  const missingRequired = !hasRequiredMods(mods);
  const nitradoUpdateAvailable = nitradoUpdate?.update_available ?? false;

  const jarFiles = (files: FileList | null): File[] => {
    if (!files) return [];
    return Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".jar"));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.types?.includes("Files")) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!activeInstance || running || uploadMods.isPending) return;
    const files = jarFiles(e.dataTransfer.files);
    if (files.length === 0) {
      toast.error("No .jar files in drop");
      return;
    }
    uploadMods.mutate(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = jarFiles(e.target.files);
    e.target.value = "";
    if (files.length > 0) uploadMods.mutate(files);
  };

  const handleInstallRequired = async () => {
    if (running) return;
    setInstalling(true);
    try {
      await api<{ ok: boolean }>("/api/mods/install-required", {
        method: "POST",
        body: "{}",
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["mods", "nitrado-update-status"] });
    } catch {
      // Error shown via mutation
    } finally {
      setInstalling(false);
    }
  };

  const canDrop = activeInstance && !running && !uploadMods.isPending;

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Mods</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {running
              ? "Stop the server to enable or disable mods."
              : "Toggle mods on or off. Disabled mods are moved to a subfolder and not loaded."}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex shrink-0 items-center gap-2">
            {activeInstance && modsPath && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={handleOpenFolder}
                title="Open mods folder in File Explorer"
              >
                <FolderOpen className="h-4 w-4" />
                View Mods Folder
              </Button>
            )}
            {activeInstance && (missingRequired || nitradoUpdateAvailable) && (
              <Button
                size="sm"
                onClick={handleInstallRequired}
                disabled={running || installing}
                className="gap-2"
                title={
                  running
                    ? "Stop the server first"
                    : missingRequired
                      ? "Install WebServer + Query plugins"
                      : "Update to latest from GitHub (configs preserved)"
                }
              >
                <Download className="h-4 w-4" />
                {installing ? (missingRequired ? "Downloading..." : "Updating...") : missingRequired ? "Download required mods" : "Update Nitrado plugins"}
              </Button>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-auto gap-1.5 py-1 px-0 text-muted-foreground hover:text-foreground"
            onClick={() => setShowExplainer((v) => !v)}
          >
            {showExplainer ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            What are Mods?
          </Button>
        </div>
      </div>

      {activeInstance && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jar"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <Card
            role="button"
            tabIndex={canDrop ? 0 : undefined}
            className={cn(
              "border-2 border-dashed transition-all duration-200",
              canDrop
                ? isDragging
                  ? "border-emerald-500/80 bg-accent ring-2 ring-emerald-400/60 ring-offset-2 ring-offset-background"
                  : "border-primary bg-muted hover:bg-muted/95 cursor-pointer"
                : "border-muted-foreground/50 bg-muted/60 opacity-70"
            )}
            onClick={() => canDrop && fileInputRef.current?.click()}
            onKeyDown={(e) => canDrop && (e.key === "Enter" || e.key === " ") && fileInputRef.current?.click()}
          >
            <CardContent className="flex flex-col items-center gap-2 py-6 sm:flex-row sm:py-4">
              <Upload className={cn("h-10 w-10 shrink-0 sm:h-8 sm:w-8 transition-transform", isDragging && canDrop ? "text-emerald-400 scale-110" : canDrop ? "text-foreground/90" : "text-muted-foreground")} />
              <div className="flex flex-col items-center gap-1 text-center sm:items-start sm:text-left">
                <span className={cn("text-sm", canDrop ? (isDragging ? "font-semibold text-foreground" : "text-foreground") : "text-muted-foreground")}>
                  {canDrop ? (
                    isDragging ? (
                      "Drop to add mods"
                    ) : (
                      <>Drag & drop <span className="font-semibold">.jar</span> files here</>
                    )
                  ) : (
                    "Stop the server to add mods"
                  )}
                </span>
                {canDrop && (
                  <span className={cn(
                    "text-xs font-medium underline underline-offset-2",
                    isDragging ? "text-muted-foreground" : "text-foreground"
                  )}>
                    {isDragging ? "Release to add" : "or click to select files"}
                  </span>
                )}
              </div>
            </CardContent>
        </Card>
        </>
      )}

      {showExplainer && (
        <Card className="border-muted/50 bg-muted/20">
          <CardContent className="flex gap-4 py-4">
            <Info className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
            <div className="min-w-0 space-y-2 text-sm">
              <p className="font-medium text-foreground">What are Mods?</p>
              <p className="text-muted-foreground leading-relaxed">
                <strong>Mods</strong> is the umbrella term for two types of game modifications:
              </p>
              <ul className="space-y-1.5 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Code2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Plugins</strong> — Java .jar files that add mechanics, commands, QoL, etc.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Palette className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Asset Packs</strong> — Textures, models, sounds, behavior definitions (new blocks, mobs, cosmetics)</span>
                </li>
              </ul>
            <p className="text-muted-foreground leading-relaxed">
              A mod can be Plugin only, Pack only, or both (Plugin + Pack). This folder contains .jar files; each is auto-detected from its manifest.
            </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!activeInstance ? (
        <p className="text-sm text-muted-foreground">No instance selected.</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading mods...</p>
      ) : mods.length === 0 ? (
        <Card className={cn(canDrop && "border-dashed")}>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No mods found. Drag & drop .jar files here, or find mods at{" "}
            <a
              href="https://www.curseforge.com/hytale"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              CurseForge
            </a>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {regularMods.length > 0 && (
            <div className="space-y-2">
              {regularMods.map((mod) => (
                <ModCard
                  key={mod.path}
                  mod={mod}
                  running={running}
                  toggleMod={toggleMod}
                  getModFolderPath={getModFolderPath}
                  openPathInExplorer={openPathInExplorer}
                />
              ))}
            </div>
          )}
          {requiredMods.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Required
              </h3>
              {requiredMods.map((mod) => (
                <ModCard
                  key={mod.path}
                  mod={mod}
                  running={running}
                  toggleMod={toggleMod}
                  getModFolderPath={getModFolderPath}
                  openPathInExplorer={openPathInExplorer}
                />
              ))}
            </div>
          )}
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
