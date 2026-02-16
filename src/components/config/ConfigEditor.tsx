import { useMemo, useState, useRef } from "react";
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
import { ChevronDown, ChevronRight } from "lucide-react";
import { useSettings } from "@/api/hooks/useSettings";
import { ServerSettingsEditor, type ServerSettingsEditorRef } from "./ServerSettingsEditor";

interface ConfigEditorProps {
  content: string;
  onChange: (content: string) => void;
  statusMsg: string;
  onSave: () => void;
  isSaving: boolean;
}

interface ParsedConfig {
  ServerName?: string;
  MOTD?: string;
  Password?: string;
  MaxPlayers?: number;
  MaxViewRadius?: number;
  DisplayTmpTagsInStrings?: boolean;
  Defaults?: { World?: string; GameMode?: string };
  RateLimit?: { Enabled?: boolean; PacketsPerSecond?: number; BurstCapacity?: number };
  [key: string]: unknown;
}

export function ConfigEditor({
  content,
  onChange,
  statusMsg,
  onSave,
  isSaving,
}: ConfigEditorProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const serverSettingsRef = useRef<ServerSettingsEditorRef | null>(null);
  const [serverSettingsSaving, setServerSettingsSaving] = useState(false);
  const { data: settings } = useSettings();
  const hasActiveInstance = Boolean(settings?.active_instance);

  const { parsed, error } = useMemo(() => {
    try {
      const p = JSON.parse(content) as ParsedConfig;
      return { parsed: p, error: null };
    } catch (e) {
      return { parsed: null, error: (e as Error).message };
    }
  }, [content]);

  const update = (path: string[], value: unknown) => {
    if (!parsed) return;
    const next = JSON.parse(JSON.stringify(parsed));
    let target: Record<string, unknown> = next;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!(key in target) || typeof target[key] !== "object") {
        target[key] = {};
      }
      target = target[key] as Record<string, unknown>;
    }
    target[path[path.length - 1]] = value;
    onChange(JSON.stringify(next, null, 2));
  };

  const get = (path: string[]): unknown => {
    if (!parsed) return undefined;
    let target: unknown = parsed;
    for (const key of path) {
      if (target && typeof target === "object" && key in target) {
        target = (target as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }
    return target;
  };

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Invalid JSON: {error}
      </p>
    );
  }

  if (!parsed) return null;

  const serverName = String(get(["ServerName"]) ?? "Hytale Server");
  const motd = String(get(["MOTD"]) ?? "");
  const password = String(get(["Password"]) ?? "");
  const maxPlayers = Number(get(["MaxPlayers"])) || 100;
  const maxViewRadius = Number(get(["MaxViewRadius"])) || 32;
  const defaultWorld = String(get(["Defaults", "World"]) ?? "default");
  const gameMode = String(get(["Defaults", "GameMode"]) ?? "Adventure");
  const rateLimitEnabled = Boolean(get(["RateLimit", "Enabled"]) ?? true);
  const packetsPerSecond = Number(get(["RateLimit", "PacketsPerSecond"])) || 2000;
  const burstCapacity = Number(get(["RateLimit", "BurstCapacity"])) || 500;
  const displayTmpTags = Boolean(get(["DisplayTmpTagsInStrings"]));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="serverName" className="text-xs">Server Name</Label>
          <Input
            id="serverName"
            value={serverName}
            onChange={(e) => update(["ServerName"], e.target.value)}
            className="h-8"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="motd" className="text-xs">Message of the Day</Label>
          <Input
            id="motd"
            value={motd}
            onChange={(e) => update(["MOTD"], e.target.value)}
            className="h-8"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-xs">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => update(["Password"], e.target.value)}
          placeholder="Leave empty for no password"
          className="h-8"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="maxPlayers" className="text-xs">Max Players</Label>
          <Input
            id="maxPlayers"
            type="number"
            min={1}
            max={2000}
            value={maxPlayers}
            onChange={(e) =>
              update(["MaxPlayers"], Math.max(1, parseInt(e.target.value, 10) || 100))
            }
            className="h-8"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="maxViewRadius" className="text-xs">View distance</Label>
          <Input
            id="maxViewRadius"
            type="number"
            min={8}
            max={64}
            value={maxViewRadius}
            onChange={(e) =>
              update(
                ["MaxViewRadius"],
                Math.max(8, Math.min(64, parseInt(e.target.value, 10) || 32))
              )
            }
            className="h-8"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="defaultWorld" className="text-xs">Default World</Label>
          <Input
            id="defaultWorld"
            value={defaultWorld}
            onChange={(e) =>
              update(
                ["Defaults"],
                {
                  ...((parsed.Defaults as Record<string, unknown>) || {}),
                  World: e.target.value,
                  GameMode: gameMode,
                }
              )
            }
            className="h-8"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="gameMode" className="text-xs">Game Mode</Label>
          <Select
            value={gameMode}
            onValueChange={(v) =>
              update(
                ["Defaults"],
                {
                  ...((parsed.Defaults as Record<string, unknown>) || {}),
                  World: defaultWorld,
                  GameMode: v,
                }
              )
            }
          >
            <SelectTrigger id="gameMode" className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Adventure">Adventure</SelectItem>
              <SelectItem value="Creative">Creative</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
        <div className="space-y-3 pt-1 border-t border-border/60">
          <div className="flex items-center justify-between">
            <Label htmlFor="rateLimitEnabled" className="text-xs font-normal">Rate limiting</Label>
            <Switch
              id="rateLimitEnabled"
              checked={rateLimitEnabled}
              onCheckedChange={(c) => update(["RateLimit"], {
                ...((parsed.RateLimit as Record<string, unknown>) || {}),
                Enabled: c,
                PacketsPerSecond: packetsPerSecond,
                BurstCapacity: burstCapacity,
              })}
            />
          </div>
          {rateLimitEnabled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="packetsPerSecond" className="text-xs">Packets/sec</Label>
                <Input
                  id="packetsPerSecond"
                  type="number"
                  min={100}
                  value={packetsPerSecond}
                  onChange={(e) =>
                    update(["RateLimit"], {
                      ...((parsed.RateLimit as Record<string, unknown>) || {}),
                      Enabled: rateLimitEnabled,
                      PacketsPerSecond: parseInt(e.target.value, 10) || 2000,
                      BurstCapacity: burstCapacity,
                    })
                  }
                  className="h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="burstCapacity" className="text-xs">Burst capacity</Label>
                <Input
                  id="burstCapacity"
                  type="number"
                  min={50}
                  value={burstCapacity}
                  onChange={(e) =>
                    update(["RateLimit"], {
                      ...((parsed.RateLimit as Record<string, unknown>) || {}),
                      Enabled: rateLimitEnabled,
                      PacketsPerSecond: packetsPerSecond,
                      BurstCapacity: parseInt(e.target.value, 10) || 500,
                    })
                  }
                  className="h-8"
                />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <Label htmlFor="displayTmpTags" className="text-xs font-normal">Display tmp tags (debug)</Label>
            <Switch
              id="displayTmpTags"
              checked={displayTmpTags}
              onCheckedChange={(c) => update(["DisplayTmpTagsInStrings"], c)}
            />
          </div>
        </div>
      )}

      <div className="border-t border-border/60 pt-4 mt-4">
        <ServerSettingsEditor
          ref={serverSettingsRef}
          noFooter
          onSaveStateChange={setServerSettingsSaving}
        />
      </div>

      <div className="flex items-center justify-between border-t pt-3 mt-2">
        <span className="text-xs text-muted-foreground">{statusMsg}</span>
        <Button
          size="sm"
          onClick={() => {
            onSave();
            if (hasActiveInstance) serverSettingsRef.current?.save();
          }}
          disabled={isSaving || serverSettingsSaving}
        >
          {isSaving || serverSettingsSaving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
