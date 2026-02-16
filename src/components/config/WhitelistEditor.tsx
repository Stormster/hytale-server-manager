import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

interface WhitelistEditorProps {
  content: string;
  onChange: (content: string) => void;
  statusMsg: string;
  onSave: () => void;
  isSaving: boolean;
}

interface WhitelistData {
  enabled?: boolean;
  list?: string[];
}

export function WhitelistEditor({
  content,
  onChange,
  statusMsg,
  onSave,
  isSaving,
}: WhitelistEditorProps) {
  const { data, error } = useMemo(() => {
    try {
      const d = JSON.parse(content) as WhitelistData;
      return { data: d, error: null };
    } catch (e) {
      return { data: null, error: (e as Error).message };
    }
  }, [content]);

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Invalid JSON: {error}
      </p>
    );
  }

  if (!data) return null;

  const enabled = Boolean(data.enabled ?? false);
  const list = Array.isArray(data.list) ? [...data.list] : [];

  const setEnabled = (v: boolean) => {
    onChange(JSON.stringify({ ...data, enabled: v, list }, null, 2));
  };

  const setList = (newList: string[]) => {
    onChange(JSON.stringify({ ...data, enabled, list: newList }, null, 2));
  };

  const addEntry = () => {
    setList([...list, ""]);
  };

  const updateEntry = (index: number, value: string) => {
    const next = [...list];
    next[index] = value;
    setList(next);
  };

  const removeEntry = (index: number) => {
    setList(list.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Label htmlFor="whitelistEnabled" className="text-xs">Enable whitelist</Label>
        <Switch
          id="whitelistEnabled"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Allowed players</Label>
          <Button type="button" variant="outline" size="sm" onClick={addEntry}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        </div>
        <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1.5">
          {list.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">
              No entries. Click Add.
            </p>
          ) : (
            list.map((entry, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={entry}
                  onChange={(e) => updateEntry(i, e.target.value)}
                  placeholder="UUID or username"
                  className="h-8 flex-1 text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => removeEntry(i)}
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
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
