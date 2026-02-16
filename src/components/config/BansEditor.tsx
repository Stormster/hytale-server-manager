import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

interface BanEntry {
  uuid?: string;
  name?: string;
  reason?: string;
  [key: string]: unknown;
}

interface BansEditorProps {
  content: string;
  onChange: (content: string) => void;
  statusMsg: string;
  onSave: () => void;
  isSaving: boolean;
}

export function BansEditor({
  content,
  onChange,
  statusMsg,
  onSave,
  isSaving,
}: BansEditorProps) {
  const { bans, error } = useMemo(() => {
    try {
      const parsed = JSON.parse(content);
      const arr = Array.isArray(parsed) ? parsed : [];
      const normalized = arr.map((item: unknown) => {
        if (item && typeof item === "object") {
          return { ...(item as Record<string, unknown>) } as BanEntry;
        }
        return { uuid: "", name: "", reason: "" } as BanEntry;
      });
      return { bans: normalized, error: null };
    } catch (e) {
      return { bans: [], error: (e as Error).message };
    }
  }, [content]);

  const setBans = (newBans: BanEntry[]) => {
    onChange(JSON.stringify(newBans, null, 2));
  };

  const addBan = () => {
    setBans([...bans, { uuid: "", name: "", reason: "" }]);
  };

  const updateBan = (index: number, field: keyof BanEntry, value: string) => {
    const next = [...bans];
    next[index] = { ...next[index], [field]: value };
    setBans(next);
  };

  const removeBan = (index: number) => {
    setBans(bans.filter((_, i) => i !== index));
  };

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Invalid JSON: {error}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={addBan}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add
        </Button>
      </div>

      <div className="max-h-64 overflow-y-auto space-y-3">
        {bans.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            No bans. Click Add.
          </p>
        ) : (
          bans.map((ban, i) => (
            <div key={i} className="rounded border p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">#{i + 1}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-destructive hover:text-destructive"
                  onClick={() => removeBan(i)}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Remove
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor={`ban-uuid-${i}`} className="text-xs">UUID</Label>
                  <Input
                    id={`ban-uuid-${i}`}
                    value={ban.uuid ?? ""}
                    onChange={(e) => updateBan(i, "uuid", e.target.value)}
                    placeholder="UUID"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`ban-name-${i}`} className="text-xs">Name</Label>
                  <Input
                    id={`ban-name-${i}`}
                    value={ban.name ?? ""}
                    onChange={(e) => updateBan(i, "name", e.target.value)}
                    placeholder="Name"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`ban-reason-${i}`} className="text-xs">Reason</Label>
                  <Input
                    id={`ban-reason-${i}`}
                    value={ban.reason ?? ""}
                    onChange={(e) => updateBan(i, "reason", e.target.value)}
                    placeholder="Reason"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-xs text-muted-foreground">{statusMsg}</span>
        <Button size="sm" onClick={onSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
