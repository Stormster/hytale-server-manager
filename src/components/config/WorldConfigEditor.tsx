import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronRight } from "lucide-react";

interface WorldConfigEditorProps {
  content: string;
  onChange: (content: string) => void;
  statusMsg: string;
  onSave: () => void;
  isSaving: boolean;
  worldName: string;
}

interface ParsedWorldConfig {
  IsPvpEnabled?: boolean;
  IsFallDamageEnabled?: boolean;
  IsGameTimePaused?: boolean;
  IsSpawningNPC?: boolean;
  IsSpawnMarkersEnabled?: boolean;
  IsAllNPCFrozen?: boolean;
  GameplayConfig?: string;
  IsCompassUpdating?: boolean;
  IsSavingPlayers?: boolean;
  IsSavingChunks?: boolean;
  SaveNewChunks?: boolean;
  IsUnloadingChunks?: boolean;
  IsObjectiveMarkersEnabled?: boolean;
  DeleteOnUniverseStart?: boolean;
  DeleteOnRemove?: boolean;
  IsTicking?: boolean;
  IsBlockTicking?: boolean;
  Seed?: number;
  WorldGen?: { Type?: string; Name?: string; Version?: string };
  [key: string]: unknown;
}

export function WorldConfigEditor({
  content,
  onChange,
  statusMsg,
  onSave,
  isSaving,
  worldName,
}: WorldConfigEditorProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const { parsed, error } = useMemo(() => {
    try {
      const p = JSON.parse(content) as ParsedWorldConfig;
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

  const isPvpEnabled = Boolean(get(["IsPvpEnabled"]));
  const isFallDamageEnabled = Boolean(get(["IsFallDamageEnabled"]) ?? true);
  const isGameTimePaused = Boolean(get(["IsGameTimePaused"]));
  const isSpawningNPC = Boolean(get(["IsSpawningNPC"]) ?? true);
  const isSpawnMarkersEnabled = Boolean(get(["IsSpawnMarkersEnabled"]) ?? true);
  const isAllNPCFrozen = Boolean(get(["IsAllNPCFrozen"]));
  const gameplayConfig = String(get(["GameplayConfig"]) ?? "Default");
  const isCompassUpdating = Boolean(get(["IsCompassUpdating"]) ?? true);
  const isSavingPlayers = Boolean(get(["IsSavingPlayers"]) ?? true);
  const isSavingChunks = Boolean(get(["IsSavingChunks"]) ?? true);
  const saveNewChunks = Boolean(get(["SaveNewChunks"]) ?? true);
  const isUnloadingChunks = Boolean(get(["IsUnloadingChunks"]) ?? true);
  const isObjectiveMarkersEnabled = Boolean(get(["IsObjectiveMarkersEnabled"]) ?? true);
  const deleteOnUniverseStart = Boolean(get(["DeleteOnUniverseStart"]));
  const deleteOnRemove = Boolean(get(["DeleteOnRemove"]));
  const isTicking = Boolean(get(["IsTicking"]) ?? true);
  const isBlockTicking = Boolean(get(["IsBlockTicking"]) ?? true);
  const seed = Number(get(["Seed"])) || 0;
  const worldGen = (parsed.WorldGen as Record<string, unknown>) || {};
  const worldGenType = String(worldGen.Type ?? "Hytale");
  const worldGenName = String(worldGen.Name ?? "Default");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="world-seed" className="text-xs">Seed</Label>
          <Input
            id="world-seed"
            type="number"
            value={seed}
            onChange={(e) => update(["Seed"], parseInt(e.target.value, 10) || 0)}
            className="h-8"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gameplay-config" className="text-xs">Gameplay config</Label>
          <Input
            id="gameplay-config"
            value={gameplayConfig}
            onChange={(e) => update(["GameplayConfig"], e.target.value)}
            className="h-8"
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-xs">Gameplay</Label>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="isPvpEnabled" className="text-xs font-normal">PvP enabled</Label>
            <Switch id="isPvpEnabled" checked={isPvpEnabled} onCheckedChange={(c) => update(["IsPvpEnabled"], c)} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="isFallDamageEnabled" className="text-xs font-normal">Fall damage</Label>
            <Switch id="isFallDamageEnabled" checked={isFallDamageEnabled} onCheckedChange={(c) => update(["IsFallDamageEnabled"], c)} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="isGameTimePaused" className="text-xs font-normal">Game time paused</Label>
            <Switch id="isGameTimePaused" checked={isGameTimePaused} onCheckedChange={(c) => update(["IsGameTimePaused"], c)} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-xs">NPCs & Markers</Label>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="isSpawningNPC" className="text-xs font-normal">Spawning NPCs</Label>
            <Switch id="isSpawningNPC" checked={isSpawningNPC} onCheckedChange={(c) => update(["IsSpawningNPC"], c)} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="isSpawnMarkersEnabled" className="text-xs font-normal">Spawn markers</Label>
            <Switch id="isSpawnMarkersEnabled" checked={isSpawnMarkersEnabled} onCheckedChange={(c) => update(["IsSpawnMarkersEnabled"], c)} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="isAllNPCFrozen" className="text-xs font-normal">All NPCs frozen</Label>
            <Switch id="isAllNPCFrozen" checked={isAllNPCFrozen} onCheckedChange={(c) => update(["IsAllNPCFrozen"], c)} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-xs">Saving & Chunks</Label>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="isSavingPlayers" className="text-xs font-normal">Saving players</Label>
            <Switch id="isSavingPlayers" checked={isSavingPlayers} onCheckedChange={(c) => update(["IsSavingPlayers"], c)} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="isSavingChunks" className="text-xs font-normal">Saving chunks</Label>
            <Switch id="isSavingChunks" checked={isSavingChunks} onCheckedChange={(c) => update(["IsSavingChunks"], c)} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="saveNewChunks" className="text-xs font-normal">Save new chunks</Label>
            <Switch id="saveNewChunks" checked={saveNewChunks} onCheckedChange={(c) => update(["SaveNewChunks"], c)} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="isUnloadingChunks" className="text-xs font-normal">Unloading chunks</Label>
            <Switch id="isUnloadingChunks" checked={isUnloadingChunks} onCheckedChange={(c) => update(["IsUnloadingChunks"], c)} />
          </div>
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
            <Label htmlFor="isTicking" className="text-xs font-normal">World ticking</Label>
            <Switch id="isTicking" checked={isTicking} onCheckedChange={(c) => update(["IsTicking"], c)} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="isBlockTicking" className="text-xs font-normal">Block ticking</Label>
            <Switch id="isBlockTicking" checked={isBlockTicking} onCheckedChange={(c) => update(["IsBlockTicking"], c)} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="isCompassUpdating" className="text-xs font-normal">Compass updating</Label>
            <Switch id="isCompassUpdating" checked={isCompassUpdating} onCheckedChange={(c) => update(["IsCompassUpdating"], c)} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="isObjectiveMarkersEnabled" className="text-xs font-normal">Objective markers</Label>
            <Switch id="isObjectiveMarkersEnabled" checked={isObjectiveMarkersEnabled} onCheckedChange={(c) => update(["IsObjectiveMarkersEnabled"], c)} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="deleteOnUniverseStart" className="text-xs font-normal">Delete on universe start</Label>
            <Switch id="deleteOnUniverseStart" checked={deleteOnUniverseStart} onCheckedChange={(c) => update(["DeleteOnUniverseStart"], c)} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="deleteOnRemove" className="text-xs font-normal">Delete on remove</Label>
            <Switch id="deleteOnRemove" checked={deleteOnRemove} onCheckedChange={(c) => update(["DeleteOnRemove"], c)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="worldGenType" className="text-xs">World gen type</Label>
              <Input
                id="worldGenType"
                value={worldGenType}
                onChange={(e) => update(["WorldGen"], { ...worldGen, Type: e.target.value })}
                className="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="worldGenName" className="text-xs">World gen name</Label>
              <Input
                id="worldGenName"
                value={worldGenName}
                onChange={(e) => update(["WorldGen"], { ...worldGen, Name: e.target.value })}
                className="h-8"
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-3 mt-2">
        <span className="text-xs text-muted-foreground">{statusMsg}</span>
        <Button size="sm" onClick={onSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
