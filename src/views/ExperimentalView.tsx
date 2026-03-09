import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Sparkles, Upload, ExternalLink, CheckCircle2 } from "lucide-react";
import { useAppInfo } from "@/api/hooks/useInfo";
import { useSettings, useUpdateSettings } from "@/api/hooks/useSettings";
import { apiUpload } from "@/api/client";
import { toast } from "sonner";
import { AddonCustomCommandsManager } from "@/components/Addon";

const FEATURE_LABELS: Record<string, string> = {
  json_checker: "JSON Checker (raw config editor)",
  custom_commands: "Custom Console Commands",
};

const PATREON_URL = "https://www.patreon.com/";

export const CUSTOM_COMMANDS_SECTION_ID = "hsm-custom-commands-section";

interface ExperimentalViewProps {
  scrollToSection?: string | null;
  onScrollDone?: () => void;
}

export function ExperimentalView({ scrollToSection, onScrollDone }: ExperimentalViewProps = {}) {
  const { data: appInfo } = useAppInfo();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const [licenseKey, setLicenseKey] = useState(settings?.experimental_addon_license_key ?? "");
  const [dragOver, setDragOver] = useState(false);
  const [installing, setInstalling] = useState(false);

  const addonLoaded = appInfo?.experimental_addon_loaded === true;
  const features = appInfo?.experimental_addon_features ?? [];
  const hasFeatures = features.length > 0;

  useEffect(() => {
    if (settings?.experimental_addon_license_key !== undefined) {
      setLicenseKey(settings.experimental_addon_license_key);
    }
  }, [settings?.experimental_addon_license_key]);

  useEffect(() => {
    if (scrollToSection !== "custom-commands" || !onScrollDone) return;
    const el = document.getElementById(CUSTOM_COMMANDS_SECTION_ID);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        onScrollDone();
      });
    } else {
      onScrollDone();
    }
  }, [scrollToSection, onScrollDone]);

  const handleInstallFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".whl")) {
        toast.error("Please select a .whl file");
        return;
      }
      setInstalling(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await apiUpload<{ ok: boolean; message: string }>(
          "/api/addon/install",
          form
        );
        if (res.ok) {
          toast.success(res.message);
        } else {
          toast.error(res.message || "Install failed");
        }
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setInstalling(false);
      }
    },
    []
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleInstallFile(file);
    },
    [handleInstallFile]
  );
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);
  const onDragLeave = useCallback(() => setDragOver(false), []);

  const saveLicense = () => {
    updateSettings.mutate(
      { experimental_addon_license_key: licenseKey.trim() },
      {
        onSuccess: () => {
          toast.success("License key saved. Restart the app to activate.");
        },
      }
    );
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-amber-500" />
          Experimental
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Unlock extra features with the Experimental addon (Patreon).
        </p>
      </div>

      {/* Patreon: CTA when unlicensed, thank-you when licensed */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {hasFeatures ? "Thank you for supporting" : "Get the Experimental addon"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {hasFeatures
              ? "Your support helps keep development going. If you run into any problems with the addon or have feedback, please report issues on Patreon."
              : "Support development and get the addon with JSON Checker, auto-updates, and more. Download the addon and your license key from Patreon."}
          </p>
        </CardHeader>
        <CardContent>
          <a
            href={PATREON_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            {hasFeatures ? "Report issues on Patreon" : "Open Patreon"}
          </a>
        </CardContent>
      </Card>

      {/* Install addon: drag-drop + file input (show when addon not loaded or no features) */}
      {(!addonLoaded || !hasFeatures) && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Install addon</CardTitle>
              <p className="text-sm text-muted-foreground">
                Drag and drop the <code className="text-xs bg-muted px-1 rounded">.whl</code> file
                here, or click to browse. Then enter your license key and restart the app.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30"
                }`}
              >
                <input
                  type="file"
                  accept=".whl"
                  className="hidden"
                  id="addon-whl-input"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleInstallFile(f);
                    e.target.value = "";
                  }}
                />
                <label
                  htmlFor="addon-whl-input"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {installing ? "Installing…" : "Drop .whl here or click to select"}
                  </span>
                </label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="experimental-license">License key</Label>
                <div className="flex gap-2">
                  <Input
                    id="experimental-license"
                    type="password"
                    placeholder="Paste your license key from Patreon"
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <Button onClick={saveLicense} disabled={updateSettings.isPending}>
                    Save
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Restart the app after saving so the addon can validate your key.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Addon active: feature toggles and settings */}
      {addonLoaded && hasFeatures && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Experimental addon active
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Toggle individual features below. All are on by default.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {features.map((featureId) => {
              const enabled =
                appInfo?.experimental_addon_feature_flags?.[featureId] !== false;
              const label = FEATURE_LABELS[featureId] ?? featureId;
              return (
                <div
                  key={featureId}
                  className="flex items-center justify-between gap-4"
                >
                  <Label
                    htmlFor={`exp-feature-${featureId}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {label}
                  </Label>
                  <Switch
                    id={`exp-feature-${featureId}`}
                    checked={enabled}
                    onCheckedChange={(checked) => {
                      const flags = {
                        ...(appInfo?.experimental_addon_feature_flags ?? {}),
                        [featureId]: checked,
                      };
                      updateSettings.mutate({
                        experimental_addon_feature_flags: flags,
                      });
                    }}
                    disabled={updateSettings.isPending}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Custom Console Commands management */}
      <div id={CUSTOM_COMMANDS_SECTION_ID}>
        {addonLoaded &&
          hasFeatures &&
          features.includes("custom_commands") &&
          appInfo?.experimental_addon_feature_flags?.["custom_commands"] !== false && (
            <AddonCustomCommandsManager />
          )}
      </div>
    </div>
  );
}
