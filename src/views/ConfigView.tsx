import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FolderOpen, Code, FormInput } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConfigFile, useSaveConfigFile, useWorldsList, useWorldConfig, useSaveWorldConfig } from "@/api/hooks/useConfigFiles";
import { useAppInfo } from "@/api/hooks/useInfo";
import { useSettings } from "@/api/hooks/useSettings";
import { Textarea } from "@/components/ui/textarea";
import { ConfigEditor } from "@/components/config/ConfigEditor";
import { AddonJsonEditor } from "@/components/Addon";
import { WhitelistEditor } from "@/components/config/WhitelistEditor";
import { BansEditor } from "@/components/config/BansEditor";
import { WorldConfigEditor } from "@/components/config/WorldConfigEditor";

const CONFIG_FILES = ["config.json", "whitelist.json", "bans.json", "worlds"] as const;
const TAB_LABELS: Record<string, string> = {
  "config.json": "Config",
  "whitelist.json": "Whitelist",
  "bans.json": "Bans",
  "worlds": "Worlds",
};
const FORM_EDITABLE_FILES = new Set(["config.json", "whitelist.json", "bans.json"]);

export function ConfigView() {
  const [activeFile, setActiveFile] = useState<string>("config.json");
  const [activeWorld, setActiveWorld] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [rawMode, setRawMode] = useState(false);

  const { data: settings } = useSettings();
  const { data: appInfo } = useAppInfo();
  const useJsonCheckerEditor =
    appInfo?.experimental_addon_loaded === true &&
    (appInfo?.experimental_addon_features ?? []).includes("json_checker") &&
    appInfo?.experimental_addon_feature_flags?.["json_checker"] !== false;
  const { data: fileData, isError, error } = useConfigFile(
    activeFile && FORM_EDITABLE_FILES.has(activeFile) ? activeFile : null
  );
  const saveConfig = useSaveConfigFile();

  const { data: worldsData } = useWorldsList();
  const worlds = worldsData?.worlds ?? [];
  const { data: worldData, isError: worldError } = useWorldConfig(activeWorld);
  const saveWorldConfig = useSaveWorldConfig(activeWorld || "");

  const isWorldsView = activeFile === "worlds";
  const isLogView = !activeFile;
  const showFormEditor =
    !isLogView &&
    !isWorldsView &&
    FORM_EDITABLE_FILES.has(activeFile as (typeof CONFIG_FILES)[number]) &&
    !rawMode;

  const isRawJsonView = rawMode && (FORM_EDITABLE_FILES.has(activeFile as string) || (isWorldsView && !!activeWorld));
  const isJsonInvalid = useMemo(() => {
    if (!isRawJsonView) return false;
    try {
      const t = editorContent.trim();
      if (!t) return true;
      JSON.parse(editorContent);
      return false;
    } catch {
      return true;
    }
  }, [isRawJsonView, editorContent]);

  // Sync editor when file data loads
  useEffect(() => {
    if (fileData?.content !== undefined) {
      setEditorContent(fileData.content);
      setStatusMsg("");
    }
  }, [fileData?.content]);

  // Sync editor when world data loads
  useEffect(() => {
    if (worldData?.content !== undefined) {
      setEditorContent(worldData.content);
      setStatusMsg("");
    }
  }, [worldData?.content]);

  // Auto-select first world when entering Worlds tab
  useEffect(() => {
    if (isWorldsView && worlds.length > 0 && !activeWorld) {
      setActiveWorld(worlds[0]);
    }
    if (!isWorldsView) {
      setActiveWorld(null);
    }
  }, [isWorldsView, worlds, activeWorld]);

  // Clear stale content when switching world
  useEffect(() => {
    if (isWorldsView && activeWorld && !worldData?.content) {
      setEditorContent("");
    }
  }, [isWorldsView, activeWorld, worldData?.content]);

  useEffect(() => {
    if (isError) {
      setEditorContent("");
      setStatusMsg(`${activeFile} not found or unreadable`);
    }
  }, [isError, error, activeFile]);

  useEffect(() => {
    if (worldError && activeWorld) {
      setEditorContent("");
      setStatusMsg(`World '${activeWorld}' not found`);
    }
  }, [worldError, activeWorld]);

  const handleSave = () => {
    if (!activeFile) return;
    if (isJsonInvalid) return;
    if (isWorldsView && activeWorld) {
      saveWorldConfig.mutate(
        { content: editorContent },
        {
          onSuccess: () => setStatusMsg(`Saved ${activeWorld}`),
          onError: (err) => setStatusMsg(`Error: ${err.message}`),
        }
      );
    } else {
      saveConfig.mutate(
        { filename: activeFile, content: editorContent },
        {
          onSuccess: () => setStatusMsg(`Saved ${activeFile}`),
          onError: (err) => setStatusMsg(`Error: ${err.message}`),
        }
      );
    }
  };

  const activeInstance = settings?.active_instance;
  const rootDir = (settings?.root_dir || "").replace(/[/\\]+$/, "");
  const sep = rootDir.includes("\\") ? "\\" : "/";
  const serverPath = activeInstance && rootDir ? [rootDir, activeInstance, "Server"].join(sep) : "";

  const handleOpenFolder = async () => {
    if (!serverPath) return;
    const { openPathInExplorer } = await import("@/lib/openPath");
    await openPathInExplorer(serverPath);
  };

  return (
    <div className="flex h-full flex-col min-h-0">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 flex flex-col mx-auto max-w-4xl w-full px-6 py-8">
      <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
        <h2 className="text-xl font-bold">Configuration</h2>
        {serverPath && (
          <Button
            size="sm"
            variant="outline"
            className="gap-2 shrink-0"
            onClick={handleOpenFolder}
            title="Open Server folder in File Explorer"
          >
            <FolderOpen className="h-4 w-4" />
            View Server Folder
          </Button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex shrink-0 items-center justify-between mb-4 gap-4 flex-wrap">
        <Tabs
          value={activeFile || "none"}
          onValueChange={(v) => v !== "none" && setActiveFile(v)}
        >
          <TabsList>
            {CONFIG_FILES.map((f) => (
              <TabsTrigger key={f} value={f}>
                {TAB_LABELS[f] ?? f}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          {!isLogView && (FORM_EDITABLE_FILES.has(activeFile as (typeof CONFIG_FILES)[number]) || isWorldsView) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={rawMode ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setRawMode(!rawMode)}
                >
                  {rawMode ? <FormInput className="h-4 w-4 mr-1" /> : <Code className="h-4 w-4 mr-1" />}
                  {rawMode ? "Form" : "Raw JSON"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{rawMode ? "Switch to form view" : "Edit as raw JSON"}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Editor */}
      <Card className="flex-1 min-h-0 flex flex-col">
        <CardContent className="flex-1 min-h-0 flex flex-col pt-4 pb-4 gap-3">
          {!activeFile && statusMsg && (
            <p className="text-xs text-muted-foreground shrink-0">{statusMsg}</p>
          )}

          {isWorldsView ? (
            <div className="flex flex-col flex-1 min-h-0 gap-4">
              <div className="flex flex-wrap gap-2 shrink-0">
                <Tabs value={activeWorld || "none"} onValueChange={(v) => v !== "none" && setActiveWorld(v)}>
                  <TabsList className="h-9">
                    {worlds.map((w) => (
                      <TabsTrigger key={w} value={w}>
                        {w}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
              {worlds.length === 0 ? (
                <p className="text-sm text-muted-foreground shrink-0">
                  No worlds found. Worlds are created in Server/universe/worlds/
                </p>
              ) : activeWorld ? (
                rawMode ? (
                  <div className="flex flex-col flex-1 min-h-0 gap-3">
                    {useJsonCheckerEditor ? (
                      <AddonJsonEditor
                        value={editorContent}
                        onChange={setEditorContent}
                        className="flex-1 min-h-0 rounded-md border border-input overflow-hidden"
                      />
                    ) : (
                      <Textarea
                        value={editorContent}
                        onChange={(e) => setEditorContent(e.target.value)}
                        className="flex-1 min-h-[200px] font-mono text-sm resize-none"
                        placeholder="{}"
                        aria-label="World config JSON"
                      />
                    )}
                    {!useJsonCheckerEditor && isJsonInvalid && (
                      <p className="text-sm text-destructive shrink-0">Invalid JSON</p>
                    )}
                    <div className="flex items-center justify-between shrink-0">
                      <span className="text-xs text-muted-foreground">{statusMsg}</span>
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={saveWorldConfig.isPending || isJsonInvalid}
                      >
                        {saveWorldConfig.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <WorldConfigEditor
                    content={editorContent}
                    onChange={setEditorContent}
                    statusMsg={statusMsg}
                    onSave={handleSave}
                    isSaving={saveWorldConfig.isPending}
                    worldName={activeWorld}
                  />
                )
              ) : null}
            </div>
          ) : showFormEditor ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              {activeFile === "config.json" && (
                <ConfigEditor
                  content={editorContent}
                  onChange={setEditorContent}
                  statusMsg={statusMsg}
                  onSave={handleSave}
                  isSaving={saveConfig.isPending}
                />
              )}
              {activeFile === "whitelist.json" && (
                <WhitelistEditor
                  content={editorContent}
                  onChange={setEditorContent}
                  statusMsg={statusMsg}
                  onSave={handleSave}
                  isSaving={saveConfig.isPending}
                />
              )}
              {activeFile === "bans.json" && (
                <BansEditor
                  content={editorContent}
                  onChange={setEditorContent}
                  statusMsg={statusMsg}
                  onSave={handleSave}
                  isSaving={saveConfig.isPending}
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0 gap-3">
              {useJsonCheckerEditor ? (
                <AddonJsonEditor
                  value={editorContent}
                  onChange={setEditorContent}
                  className="flex-1 min-h-0 rounded-md border border-input overflow-hidden"
                />
              ) : (
                <Textarea
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  className="flex-1 min-h-[200px] font-mono text-sm resize-none"
                  placeholder="{}"
                  aria-label="Config JSON"
                />
              )}
              {!useJsonCheckerEditor && isJsonInvalid && (
                <p className="text-sm text-destructive shrink-0">Invalid JSON</p>
              )}
              <div className="flex items-center justify-between shrink-0">
                <span className="text-xs text-muted-foreground">{statusMsg}</span>
                {!isLogView && (
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!activeFile || saveConfig.isPending || isJsonInvalid}
                  >
                    {saveConfig.isPending ? "Saving..." : "Save"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  );
}
