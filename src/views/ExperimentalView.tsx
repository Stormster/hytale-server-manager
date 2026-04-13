import { useState, useCallback, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Sparkles, Upload, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
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
  const { data: appInfo, refetch: refetchAppInfo } = useAppInfo();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const [licenseKey, setLicenseKey] = useState(settings?.experimental_addon_license_key ?? "");
  const [dragOver, setDragOver] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [verifyingLicense, setVerifyingLicense] = useState(false);
  const [installingFromSite, setInstallingFromSite] = useState(false);
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [uninstallingAddon, setUninstallingAddon] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<{
    checked: boolean;
    update_available: boolean;
    latest_version?: string | null;
    current_version?: string | null;
    reason?: string;
  } | null>(null);
  /** null = unknown, true/false = result of last verify (for current key). */
  const [licenseVerified, setLicenseVerified] = useState<boolean | null>(null);
  const verifiedKeyRef = useRef<string>("");

  const addonLoaded = appInfo?.experimental_addon_loaded === true;
  const addonInstalled = appInfo?.experimental_addon_installed === true;
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
        : `Latest addon v${appInfo.experimental_addon_latest_version}${
            appInfo.experimental_addon_installed_version
              ? ` — installed v${appInfo.experimental_addon_installed_version}`
              : ""
          } (up to date)`
      : null
    : null;

  useEffect(() => {
    if (settings?.experimental_addon_license_key !== undefined) {
      setLicenseKey(settings.experimental_addon_license_key);
    }
  }, [settings?.experimental_addon_license_key]);

  /** Call verify API and update licenseVerified state. Returns true if valid. */
  const runVerify = useCallback(async (key: string): Promise<boolean> => {
    if (!key.trim()) return false;
    try {
      const res = await api<{ ok?: boolean; valid?: boolean }>(
        "/api/addon/license/verify?license_key=" + encodeURIComponent(key.trim())
      );
      const valid = res.valid === true;
      setLicenseVerified(valid);
      verifiedKeyRef.current = key.trim();
      return valid;
    } catch {
      setLicenseVerified(false);
      verifiedKeyRef.current = key.trim();
      return false;
    }
  }, []);

  /** Auto-verify on startup and when saved key changes. */
  useEffect(() => {
    const key = (settings?.experimental_addon_license_key ?? "").trim();
    if (!key) {
      setLicenseVerified(null);
      verifiedKeyRef.current = "";
      return;
    }
    if (verifiedKeyRef.current === key) return;
    setLicenseVerified(null);
    setVerifyingLicense(true);
    runVerify(key).finally(() => setVerifyingLicense(false));
  }, [settings?.experimental_addon_license_key, runVerify]);

  /** When user changes the key in the input, clear verified state until they save or we re-run. */
  useEffect(() => {
    const key = licenseKey.trim();
    if (key && key !== verifiedKeyRef.current) setLicenseVerified(null);
  }, [licenseKey]);

  useEffect(() => {
    if (scrollToSection !== "custom-commands" || !onScrollDone) return;
    const el = document.getElementById(CUSTOM_COMMANDS_SECTION_ID);
    if (!el) {
      onScrollDone();
      return;
    }
    // Addon UI mounts asynchronously; run extra passes so the final position is accurate.
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 220);
      window.setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 520);
      onScrollDone();
    });
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
          await refetchAppInfo();
        } else {
          toast.error(res.message || "Install failed");
        }
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setInstalling(false);
      }
    },
    [refetchAppInfo]
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
    const key = licenseKey.trim();
    updateSettings.mutate(
      { experimental_addon_license_key: key },
      {
        onSuccess: () => {
          if (!key) {
            setLicenseVerified(null);
            verifiedKeyRef.current = "";
            toast.success("License key cleared.");
            return;
          }
          toast.success("License key saved. Verifying…");
          setVerifyingLicense(true);
          runVerify(key).then((valid) => {
            if (valid) toast.success("License verified. Restart the app to activate.");
            else toast.error("License invalid or inactive (e.g. Patreon expired). Resubscribe and click Verify license.");
          }).finally(() => setVerifyingLicense(false));
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
      const valid = await runVerify(key);
      if (valid) toast.success("License key is valid.");
      else toast.error("License key is invalid or inactive.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setVerifyingLicense(false);
    }
  }, [licenseKey, runVerify]);

  /** Verify license first; return false if invalid or missing. */
  const ensureLicenseValid = useCallback(async (): Promise<boolean> => {
    const key = licenseKey.trim();
    if (!key) {
      toast.error("Enter your license key first.");
      return false;
    }
    if (licenseVerified === false) {
      toast.error("License key is invalid. Save a valid key and try again.");
      return false;
    }
    if (licenseVerified === true && verifiedKeyRef.current === key) return true;
    setVerifyingLicense(true);
    try {
      const valid = await runVerify(key);
      if (!valid) toast.error("License key is invalid or inactive.");
      return valid;
    } finally {
      setVerifyingLicense(false);
    }
  }, [licenseKey, licenseVerified, runVerify]);

  const installFromSite = useCallback(
    async (options?: { forceReinstall?: boolean }) => {
    if (!(await ensureLicenseValid())) return;
    const key = licenseKey.trim();
    const force = Boolean(options?.forceReinstall);
    const diskV = (appInfo?.experimental_addon_installed_version ?? "").trim();
    setInstallingFromSite(true);
    try {
      const body: {
        license_key: string;
        current_version?: string;
        force_reinstall?: boolean;
      } = { license_key: key };
      if (force) body.force_reinstall = true;
      else if (diskV) body.current_version = diskV;

      const res = await api<{
        ok: boolean;
        update_available?: boolean;
        message?: string;
        reason?: string;
      }>("/api/addon/update/install", {
        method: "POST",
        body: JSON.stringify(body),
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
        await refetchAppInfo();
      } else {
        toast.success(res.message || "Addon updated. Restart the app to activate.");
        setUpdateStatus({
          checked: true,
          update_available: false,
          latest_version: undefined,
          current_version: undefined,
          reason: "restart_required",
        });
        await refetchAppInfo();
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setInstallingFromSite(false);
    }
  },
  [licenseKey, ensureLicenseValid, refetchAppInfo, appInfo?.experimental_addon_installed_version]
  );

  const checkForUpdates = useCallback(async () => {
    if (!(await ensureLicenseValid())) return;
    const key = licenseKey.trim();
    const diskV = (appInfo?.experimental_addon_installed_version ?? "").trim();
    setCheckingForUpdates(true);
    try {
      const params = new URLSearchParams();
      params.set("license_key", key);
      if (diskV) params.set("current_version", diskV);
      const res = await api<{
        ok: boolean;
        update_available?: boolean;
        latest_version?: string;
        current_version?: string | null;
        reason?: string;
      }>(`/api/addon/update/check?${params.toString()}`);
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
  }, [licenseKey, ensureLicenseValid, appInfo?.experimental_addon_installed_version]);

  const uninstallAddon = useCallback(async () => {
    setUninstallingAddon(true);
    try {
      const res = await api<{ ok: boolean; removed?: boolean; message?: string }>("/api/addon/uninstall", {
        method: "POST",
      });
      toast.success(res.message || "Addon uninstalled. Restart the app.");
      setUpdateStatus(null);
      await refetchAppInfo();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUninstallingAddon(false);
    }
  }, [refetchAppInfo]);

  const updateStatusText = updateStatus
    ? updateStatus.update_available
      ? `Update available${updateStatus.latest_version ? `: v${updateStatus.latest_version}` : ""}`
      : updateStatus.reason === "restart_required"
      ? "Updated successfully. Restart required."
      : `Up to date${updateStatus.latest_version ? ` (latest v${updateStatus.latest_version})` : ""}`
    : null;

  const licenseStatusLine =
    !licenseKey.trim() ? null : verifyingLicense ? (
      <p className="text-xs text-muted-foreground">Verifying license…</p>
    ) : licenseVerified === true ? (
      <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        License verified
      </p>
    ) : licenseVerified === false ? (
      <p className="text-xs text-destructive flex items-center gap-1">
        <XCircle className="h-3.5 w-3.5 shrink-0" />
        License invalid or inactive
      </p>
    ) : null;

  const licenseStatusText =
    !licenseKey.trim() ? "No" : verifyingLicense ? "Checking..." : licenseVerified ? "Yes" : "No";

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Addon status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Addon file installed: <span className="font-medium">{addonInstalled ? "Yes" : "No"}</span>
          </p>
          <p>
            Addon loaded: <span className="font-medium">{addonLoaded ? "Yes" : "No"}</span>
          </p>
          <p>
            License valid: <span className="font-medium">{licenseStatusText}</span>
          </p>
          {addonInstalled && (
            <div className="pt-2">
              <Button
                variant="outline"
                onClick={uninstallAddon}
                disabled={uninstallingAddon || installingFromSite}
              >
                {uninstallingAddon ? "Uninstalling..." : "Uninstall addon"}
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Restart the app after install/update/uninstall so addon load state refreshes.
          </p>
        </CardContent>
      </Card>

      {/* Normal install: site download only (check for updates after addon is active) */}
      {(!addonLoaded || !hasFeatures) && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Install from hytalemanager.com</CardTitle>
              <p className="text-sm text-muted-foreground">
                Save your license key, then download and install the addon. After it shows as loaded,
                use Check for updates in License & addon updates.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
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
                {licenseStatusLine}
                <div className="flex flex-wrap gap-2">
                  {licenseVerified === false && (
                    <Button
                      variant="outline"
                      onClick={verifyLicense}
                      disabled={verifyingLicense || installingFromSite}
                    >
                      {verifyingLicense ? "Verifying..." : "Verify license"}
                    </Button>
                  )}
                  <Button
                    onClick={() => void installFromSite()}
                    disabled={installingFromSite || verifyingLicense}
                  >
                    {installingFromSite ? "Downloading..." : "Download & install addon"}
                  </Button>
                </div>
                {autoUpdateLine && (
                  <p className="text-xs text-muted-foreground">{autoUpdateLine}</p>
                )}
                {updateStatusText && (
                  <p className="text-xs text-muted-foreground">{updateStatusText}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Restart the app after install so the addon can load.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Advanced / manual install</CardTitle>
              <p className="text-sm text-muted-foreground">
                Drag and drop the <code className="text-xs bg-muted px-1 rounded">.whl</code> file
                here, or click to browse. Fallback for offline, testing, or emergencies only.
              </p>
            </CardHeader>
            <CardContent>
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
      {addonLoaded && hasFeatures && (() => {
        const updateAvailable =
          updateStatus?.update_available === true ||
          appInfo?.experimental_addon_update_available === true;
        const showReinstall =
          !updateAvailable && (addonInstalled || appInfo?.experimental_addon_installed === true);
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">License & addon updates</CardTitle>
              <p className="text-sm text-muted-foreground">
                Verify your key. Check for updates; if one is available, install it from hytalemanager.com.
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
              {licenseStatusLine}
              <div className="flex flex-wrap gap-2">
                {licenseVerified === false && (
                  <Button
                    variant="outline"
                    onClick={verifyLicense}
                    disabled={verifyingLicense || installingFromSite}
                  >
                    {verifyingLicense ? "Verifying..." : "Verify license"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={checkForUpdates}
                  disabled={checkingForUpdates || installingFromSite || verifyingLicense}
                >
                  {checkingForUpdates ? "Checking..." : "Check for updates"}
                </Button>
                {updateAvailable && (
                  <Button
                    onClick={() => void installFromSite()}
                    disabled={installingFromSite || verifyingLicense}
                  >
                    {installingFromSite ? "Downloading..." : "Download & install update"}
                  </Button>
                )}
                {showReinstall && (
                  <Button
                    variant="outline"
                    onClick={() => void installFromSite({ forceReinstall: true })}
                    disabled={installingFromSite || verifyingLicense}
                    title="Re-download the latest addon from the site (same version). Use if the install looks corrupted."
                  >
                    {installingFromSite ? "Downloading..." : "Reinstall addon"}
                  </Button>
                )}
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
        );
      })()}

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
