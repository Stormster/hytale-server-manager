import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FolderOpen, Code, FormInput } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConfigFile, useSaveConfigFile, useWorldsList, useWorldConfig, useSaveWorldConfig } from "@/api/hooks/useConfigFiles";
import { useSettings } from "@/api/hooks/useSettings";
import { ConfigEditor } from "@/components/config/ConfigEditor";
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
    try {
      const { api } = await import("@/api/client");
      await api<{ ok: boolean }>("/api/info/open-path", { method: "POST", body: JSON.stringify({ path: serverPath }) });
    } catch {
      try {
        const { openPath } = await import("@tauri-apps/plugin-opener");
        await openPath(serverPath);
      } catch {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(`file:///${serverPath.replace(/\\/g, "/")}`);
      }
    }
  };

  return (
    <div className="flex flex-col p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 className="text-xl font-bold">Configuration</h2>
        {serverPath && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0"
                onClick={handleOpenFolder}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open Server folder in File Explorer</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
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
      <Card>
        <CardContent className="flex flex-col pt-4 pb-4 gap-3">
          {!activeFile && statusMsg && (
            <p className="text-xs text-muted-foreground shrink-0">{statusMsg}</p>
          )}

          {isWorldsView ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
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
                <p className="text-sm text-muted-foreground">
                  No worlds found. Worlds are created in Server/universe/worlds/
                </p>
              ) : activeWorld ? (
                rawMode ? (
                  <>
                    <Textarea
                      value={editorContent}
                      onChange={(e) => setEditorContent(e.target.value)}
                      className="min-h-48 font-mono text-sm resize-y"
                      spellCheck={false}
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{statusMsg}</span>
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={saveWorldConfig.isPending}
                      >
                        {saveWorldConfig.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </>
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
            <div>
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
            <>
              <Textarea
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
                className="min-h-48 font-mono text-sm resize-y"
                spellCheck={false}
              />
              <div className="flex items-center justify-between shrink-0">
                <span className="text-xs text-muted-foreground">{statusMsg}</span>
                {!isLogView && (
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!activeFile || saveConfig.isPending}
                  >
                    {saveConfig.isPending ? "Saving..." : "Save"}
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
