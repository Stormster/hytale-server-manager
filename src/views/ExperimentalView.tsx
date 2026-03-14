import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Sparkles, Upload, ExternalLink, CheckCircle2 } from "lucide-react";
import { useAppInfo } from "@/api/hooks/useInfo";
import { useSettings, useUpdateSettings } from "@/api/hooks/useSettings";
import { api, apiUpload } from "@/api/client";
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
  const [verifyingLicense, setVerifyingLicense] = useState(false);
  const [installingFromSite, setInstallingFromSite] = useState(false);
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<{
    checked: boolean;
    update_available: boolean;
    latest_version?: string | null;
    current_version?: string | null;
    reason?: string;
  } | null>(null);

  const addonLoaded = appInfo?.experimental_addon_loaded === true;
  const features = appInfo?.experimental_addon_features ?? [];
  const hasFeatures = features.length > 0;
  const autoUpdateLine = appInfo
    ? appInfo.experimental_addon_update_reason === "no_license_key"
      ? "Latest addon: enter your license key to check."
      : appInfo.experimental_addon_update_error
      ? "Latest addon: check failed."
      : appInfo.experimental_addon_latest_version
      ? appInfo.experimental_addon_update_available
        ? `Latest addon v${appInfo.experimental_addon_latest_version} (update available)`
        : `Latest addon v${appInfo.experimental_addon_latest_version} (up to date)`
      : null
    : null;

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

  const verifyLicense = useCallback(async () => {
    const key = licenseKey.trim();
    if (!key) {
      toast.error("Enter your license key first.");
      return;
    }
    setVerifyingLicense(true);
    try {
      const res = await api<{ ok?: boolean; valid?: boolean }>("/api/addon/license/verify?license_key=" + encodeURIComponent(key));
      if (res.valid) {
        toast.success("License key is valid.");
      } else {
        toast.error("License key is invalid or inactive.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setVerifyingLicense(false);
    }
  }, [licenseKey]);

  const installFromSite = useCallback(async () => {
    const key = licenseKey.trim();
    if (!key) {
      toast.error("Enter your license key first.");
      return;
    }
    setInstallingFromSite(true);
    try {
      const res = await api<{
        ok: boolean;
        update_available?: boolean;
        message?: string;
        reason?: string;
      }>("/api/addon/update/install", {
        method: "POST",
        body: JSON.stringify({ license_key: key }),
      });
      if (res.update_available === false) {
        toast.info(res.message || "No addon update available.");
        setUpdateStatus({
          checked: true,
          update_available: false,
          latest_version: undefined,
          current_version: undefined,
          reason: res.reason,
        });
      } else {
        toast.success(res.message || "Addon updated. Restart the app to activate.");
        setUpdateStatus({
          checked: true,
          update_available: false,
          latest_version: undefined,
          current_version: undefined,
          reason: "restart_required",
        });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setInstallingFromSite(false);
    }
  }, [licenseKey]);

  const checkForUpdates = useCallback(async () => {
    const key = licenseKey.trim();
    if (!key) {
      toast.error("Enter your license key first.");
      return;
    }
    setCheckingForUpdates(true);
    try {
      const res = await api<{
        ok: boolean;
        update_available?: boolean;
        latest_version?: string;
        current_version?: string | null;
        reason?: string;
      }>("/api/addon/update/check?license_key=" + encodeURIComponent(key));
      setUpdateStatus({
        checked: true,
        update_available: Boolean(res.update_available),
        latest_version: res.latest_version,
        current_version: res.current_version,
        reason: res.reason,
      });
      if (res.update_available) {
        toast.success("Addon update available.");
      } else {
        toast.info("Addon is up to date.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCheckingForUpdates(false);
    }
  }, [licenseKey]);

  const updateStatusText = updateStatus
    ? updateStatus.update_available
      ? `Update available${updateStatus.latest_version ? `: v${updateStatus.latest_version}` : ""}`
      : updateStatus.reason === "restart_required"
      ? "Updated successfully. Restart required."
      : `Up to date${updateStatus.latest_version ? ` (latest v${updateStatus.latest_version})` : ""}`
    : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
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
              : "Support development and get the addon with a enhanced JSON Editor, Custom Console Commands, and more. Download the addon and your license key from Patreon."}
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
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={verifyLicense}
                    disabled={verifyingLicense || installingFromSite}
                  >
                    {verifyingLicense ? "Verifying..." : "Verify license"}
                  </Button>
                  <Button
                    onClick={installFromSite}
                    disabled={installingFromSite || verifyingLicense}
                  >
                    {installingFromSite ? "Downloading..." : "Download & install addon"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={checkForUpdates}
                    disabled={checkingForUpdates || installingFromSite || verifyingLicense}
                  >
                    {checkingForUpdates ? "Checking..." : "Check for updates"}
                  </Button>
                </div>
                {autoUpdateLine && (
                  <p className="text-xs text-muted-foreground">{autoUpdateLine}</p>
                )}
                {updateStatusText && (
                  <p className="text-xs text-muted-foreground">{updateStatusText}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Use Download & install addon to fetch the .whl automatically with your license key.
                  Restart the app after install to load the addon.
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

      {/* License + updater controls while addon is active */}
      {addonLoaded && hasFeatures && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">License & addon updates</CardTitle>
            <p className="text-sm text-muted-foreground">
              Verify your key and download the latest addon directly from hytalemanager.com.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
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
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={verifyLicense}
                disabled={verifyingLicense || installingFromSite}
              >
                {verifyingLicense ? "Verifying..." : "Verify license"}
              </Button>
              <Button
                onClick={installFromSite}
                disabled={installingFromSite || verifyingLicense}
              >
                {installingFromSite ? "Downloading..." : "Download & install addon"}
              </Button>
              <Button
                variant="outline"
                onClick={checkForUpdates}
                disabled={checkingForUpdates || installingFromSite || verifyingLicense}
              >
                {checkingForUpdates ? "Checking..." : "Check for updates"}
              </Button>
            </div>
            {autoUpdateLine && (
              <p className="text-xs text-muted-foreground">{autoUpdateLine}</p>
            )}
            {updateStatusText && (
              <p className="text-xs text-muted-foreground">{updateStatusText}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Restart the app after install to load the updated addon.
            </p>
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
      </div>
    </div>
  );
}
