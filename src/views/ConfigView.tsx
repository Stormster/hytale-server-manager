import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfigFile, useSaveConfigFile, useLatestLog } from "@/api/hooks/useConfigFiles";

const CONFIG_FILES = ["config.json", "whitelist.json", "bans.json"] as const;

export function ConfigView() {
  const [activeFile, setActiveFile] = useState<string>("config.json");
  const [editorContent, setEditorContent] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const { data: fileData, isError, error } = useConfigFile(activeFile);
  const saveConfig = useSaveConfigFile();
  const latestLog = useLatestLog();

  // Sync editor when file data loads
  useEffect(() => {
    if (fileData?.content !== undefined) {
      setEditorContent(fileData.content);
      setStatusMsg("");
    }
  }, [fileData?.content]);

  useEffect(() => {
    if (isError) {
      setEditorContent("");
      setStatusMsg(`${activeFile} not found or unreadable`);
    }
  }, [isError, error, activeFile]);

  const handleSave = () => {
    saveConfig.mutate(
      { filename: activeFile, content: editorContent },
      {
        onSuccess: () => setStatusMsg(`Saved ${activeFile}`),
        onError: (err) => setStatusMsg(`Error: ${err.message}`),
      }
    );
  };

  const handleViewLog = () => {
    latestLog.refetch().then(({ data }) => {
      if (data) {
        setActiveFile(""); // deselect config tabs
        setEditorContent(data.content);
        setStatusMsg(`Viewing: ${data.filename}`);
      }
    }).catch((err) => {
      setStatusMsg(`Error: ${err.message}`);
    });
  };

  return (
    <div className="flex h-full flex-col p-6">
      <h2 className="text-xl font-bold mb-4">Configuration</h2>

      {/* Tab bar */}
      <div className="flex items-center justify-between mb-4">
        <Tabs
          value={activeFile}
          onValueChange={(v) => setActiveFile(v)}
        >
          <TabsList>
            {CONFIG_FILES.map((f) => (
              <TabsTrigger key={f} value={f}>
                {f}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" onClick={handleViewLog}>
          View Latest Log
        </Button>
      </div>

      {/* Editor */}
      <Card className="flex-1 min-h-0 flex flex-col">
        <CardContent className="flex-1 flex flex-col pt-4 pb-4 gap-3">
          <p className="text-xs text-muted-foreground">
            {activeFile
              ? `Editing: Server/${activeFile}`
              : statusMsg || "Select a file above to edit"}
          </p>
          <Textarea
            value={editorContent}
            onChange={(e) => setEditorContent(e.target.value)}
            className="flex-1 min-h-0 font-mono text-sm resize-none"
            spellCheck={false}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{statusMsg}</span>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!activeFile || saveConfig.isPending}
            >
              {saveConfig.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
