import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useMods, useToggleMod } from "@/api/hooks/useMods";
import { useServerStatus } from "@/api/hooks/useServer";
import { useSettings } from "@/api/hooks/useSettings";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export function ModsView() {
  const { data: settings } = useSettings();
  const { data: modsData, isLoading } = useMods();
  const { data: serverStatus } = useServerStatus();
  const toggleMod = useToggleMod();

  const activeInstance = settings?.active_instance;
  const running = serverStatus?.running ?? false;
  const mods = modsData?.mods ?? [];

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-2">
        <h2 className="text-xl font-bold">Mods</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {running
            ? "Stop the server to enable or disable mods."
            : "Toggle mods on or off. Disabled mods are moved to a subfolder and not loaded."}
        </p>
      </div>

      {!activeInstance ? (
        <p className="text-sm text-muted-foreground">No instance selected.</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading mods...</p>
      ) : mods.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No mods found. Install a server to get the Nitrado WebServer and Query plugins.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {mods.map((mod) => (
            <Card
              key={mod.path}
              className={cn(!mod.enabled && "opacity-70")}
            >
              <CardContent className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{mod.name}</span>
                    {mod.required && (
                      <Lock
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        title="Required – cannot be disabled"
                      />
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {mod.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
