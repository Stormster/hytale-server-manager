import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/api/client";
import { useInstances } from "@/api/hooks/useInstances";
import { toast } from "sonner";

type AutoUpdateSettings = {
  instance_auto_updates: Record<string, boolean>;
  auto_update_interval_hours: number;
  auto_update_schedule: "anytime" | "window";
  auto_update_window_start: string;
  auto_update_window_end: string;
};

export function ExperimentalAutoUpdateSettings() {
  const { data: instances } = useInstances();
  const [settings, setSettings] = useState<AutoUpdateSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<AutoUpdateSettings>("/api/addon/experimental/auto-update-settings")
      .then(setSettings)
      .catch(() => setSettings(null));
  }, []);

  const save = async (next: AutoUpdateSettings) => {
    setSaving(true);
    try {
      const saved = await api<AutoUpdateSettings>("/api/addon/experimental/auto-update-settings", {
        method: "PUT",
        body: JSON.stringify(next),
      });
      setSettings(saved);
      toast.success("Auto-update settings saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Server auto-update</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Load the Experimental addon to configure scheduled server updates.
        </CardContent>
      </Card>
    );
  }

  const installed = (instances ?? []).filter((i) => i.installed);

  return (
    <Card id="hsm-auto-update-section">
      <CardHeader>
        <CardTitle className="text-base">Server auto-update</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Automatically update game servers when a new version is available. Running servers receive a graceful shutdown warning first.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 max-w-md">
          <div className="space-y-1">
            <Label>Check every (hours)</Label>
            <Input
              type="number"
              min={1}
              max={168}
              value={settings.auto_update_interval_hours}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  auto_update_interval_hours: Number(e.target.value) || 12,
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label>Schedule</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={settings.auto_update_schedule}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  auto_update_schedule: e.target.value as "anytime" | "window",
                })
              }
            >
              <option value="anytime">Any time</option>
              <option value="window">Time window only</option>
            </select>
          </div>
          {settings.auto_update_schedule === "window" && (
            <>
              <div className="space-y-1">
                <Label>Window start (HH:MM)</Label>
                <Input
                  value={settings.auto_update_window_start}
                  onChange={(e) =>
                    setSettings({ ...settings, auto_update_window_start: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Window end (HH:MM)</Label>
                <Input
                  value={settings.auto_update_window_end}
                  onChange={(e) =>
                    setSettings({ ...settings, auto_update_window_end: e.target.value })
                  }
                />
              </div>
            </>
          )}
        </div>
        <div className="space-y-2">
          <Label>Per instance</Label>
          {installed.length === 0 ? (
            <p className="text-sm text-muted-foreground">No installed instances yet.</p>
          ) : (
            installed.map((inst) => (
              <div key={inst.name} className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm font-medium">{inst.name}</span>
                <Switch
                  checked={settings.instance_auto_updates[inst.name] === true}
                  onCheckedChange={(on) => {
                    setSettings({
                      ...settings,
                      instance_auto_updates: {
                        ...settings.instance_auto_updates,
                        [inst.name]: on,
                      },
                    });
                  }}
                />
              </div>
            ))
          )}
        </div>
        <Button disabled={saving} onClick={() => save(settings)}>
          Save auto-update settings
        </Button>
      </CardContent>
    </Card>
  );
}
