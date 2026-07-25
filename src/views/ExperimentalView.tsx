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
import { ExperimentalAutoUpdateSettings } from "@/components/ExperimentalAutoUpdateSettings";
import { useAppLifecycle } from "@/components/AppLifecycleProvider";
import {
  ACTION_HIGHLIGHT_CLASS,
  ACTION_HIGHLIGHT_MS,
  consumePendingActionHighlight,
} from "@/lib/pendingActionHighlight";

const FEATURE_LABELS: Record<string, string> = {
  json_checker: "JSON Checker (raw config editor)",
  custom_commands: "Custom Console Commands",
  auto_update: "Server auto-update",
};

const PATREON_URL = "https://www.patreon.com/c/stormster";
const LICENSE_URL = "https://hytalemanager.com/license";

export const CUSTOM_COMMANDS_SECTION_ID = "hsm-custom-commands-section";

interface ExperimentalViewProps {
  scrollToSection?: string | null;
  onScrollDone?: () => void;
}

export function ExperimentalView({ scrollToSection, onScrollDone }: ExperimentalViewProps = {}) {
  const { data: appInfo, refetch: refetchAppInfo } = useAppInfo();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { requestRestart } = useAppLifecycle();
  const savedKeySet = settings?.experimental_addon_license_key_set === true;
  const savedKeyPreview = settings?.experimental_addon_license_key_preview ?? null;
  const [licenseKey, setLicenseKey] = useState("");
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
  const updateInstallButtonRef = useRef<HTMLButtonElement | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);
  const [highlightUpdateInstall, setHighlightUpdateInstall] = useState(false);
  const [pendingHighlight] = useState(() => consumePendingActionHighlight());

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

  const hasLicenseInput = Boolean(licenseKey.trim() || savedKeySet);

  /** Call verify API and update licenseVerified state. Returns true if valid. */
  const runVerify = useCallback(async (explicitKey?: string): Promise<boolean> => {
    const key = (explicitKey ?? licenseKey).trim();
    if (!key && !savedKeySet) return false;
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const body: { license_key?: string } = {};
      if (key) {
        body.license_key = key;
        headers["x-license-key"] = key;
      }
      const res = await api<{ ok?: boolean; valid?: boolean }>(
        "/api/addon/license/verify",
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }
      );
      const valid = res.valid === true;
      setLicenseVerified(valid);
      verifiedKeyRef.current = key || "__stored__";
      return valid;
    } catch {
      setLicenseVerified(false);
      verifiedKeyRef.current = key || "__stored__";
      return false;
    }
  }, [licenseKey, savedKeySet]);

  /** Auto-verify on startup when a saved key exists, or when the user enters a new key. */
  useEffect(() => {
    const key = licenseKey.trim();
    if (!key && !savedKeySet) {
      setLicenseVerified(null);
      verifiedKeyRef.current = "";
      return;
    }
    const verifyToken = key || "__stored__";
    if (verifiedKeyRef.current === verifyToken) return;
    setLicenseVerified(null);
    setVerifyingLicense(true);
    runVerify(key || undefined).finally(() => setVerifyingLicense(false));
  }, [licenseKey, savedKeySet, runVerify]);

  /** When user changes the key in the input, clear verified state until they save or we re-run. */
  useEffect(() => {
    const key = licenseKey.trim();
    const verifyToken = key || (savedKeySet ? "__stored__" : "");
    if (verifyToken && verifyToken !== verifiedKeyRef.current) setLicenseVerified(null);
  }, [licenseKey, savedKeySet]);

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

  useEffect(() => {
    const updateAvailable =
      updateStatus?.update_available === true ||
      appInfo?.experimental_addon_update_available === true;
    if (pendingHighlight !== "experimental-addon-update" || !updateAvailable) return;
    updateInstallButtonRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    if (flashTimeoutRef.current != null) {
      window.clearTimeout(flashTimeoutRef.current);
    }
    setHighlightUpdateInstall(true);
    flashTimeoutRef.current = window.setTimeout(() => {
      setHighlightUpdateInstall(false);
      flashTimeoutRef.current = null;
    }, ACTION_HIGHLIGHT_MS);
  }, [
    appInfo?.experimental_addon_update_available,
    pendingHighlight,
    updateStatus?.update_available,
  ]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current != null) {
        window.clearTimeout(flashTimeoutRef.current);
      }
    };
  }, []);

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
    if (!key) {
      toast.error("Enter a license key to save.");
      return;
    }
    updateSettings.mutate(
      { experimental_addon_license_key: key },
      {
        onSuccess: () => {
          setLicenseKey("");
          toast.success("License key saved.");
          setVerifyingLicense(true);
          runVerify(key).finally(() => setVerifyingLicense(false));
        },
      }
    );
  };

  const clearLicense = () => {
    updateSettings.mutate(
      { experimental_addon_license_key: "" },
      {
        onSuccess: () => {
          setLicenseKey("");
          setLicenseVerified(null);
          verifiedKeyRef.current = "";
          toast.success("License key cleared.");
        },
      }
    );
  };

  const verifyLicense = useCallback(async () => {
    const key = licenseKey.trim();
    if (!key && !savedKeySet) {
      toast.error("Enter your license key first.");
      return;
    }
    setVerifyingLicense(true);
    try {
      const valid = await runVerify(key || undefined);
      if (valid) toast.success("License key is valid.");
      else toast.error("License key is invalid or inactive.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setVerifyingLicense(false);
    }
  }, [licenseKey, savedKeySet, runVerify]);

  /** Verify license first; return false if invalid or missing. */
  const ensureLicenseValid = useCallback(async (): Promise<boolean> => {
    const key = licenseKey.trim();
    if (!key && !savedKeySet) {
      toast.error("Enter your license key first.");
      return false;
    }
    const verifyToken = key || "__stored__";
    if (licenseVerified === false) {
      toast.error("License key is invalid. Save a valid key and try again.");
      return false;
    }
    if (licenseVerified === true && verifiedKeyRef.current === verifyToken) return true;
    setVerifyingLicense(true);
    try {
      const valid = await runVerify(key || undefined);
      if (!valid) toast.error("License key is invalid or inactive.");
      return valid;
    } finally {
      setVerifyingLicense(false);
    }
  }, [licenseKey, savedKeySet, licenseVerified, runVerify]);

  const installFromSite = useCallback(
    async (options?: { forceReinstall?: boolean }) => {
    if (!(await ensureLicenseValid())) return;
    const key = licenseKey.trim();
    const force = Boolean(options?.forceReinstall);
    const diskV = (appInfo?.experimental_addon_installed_version ?? "").trim();
    setInstallingFromSite(true);
    try {
      const body: {
        license_key?: string;
        current_version?: string;
        force_reinstall?: boolean;
      } = {};
      if (key) body.license_key = key;
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
  [licenseKey, savedKeySet, ensureLicenseValid, refetchAppInfo, appInfo?.experimental_addon_installed_version]
  );

  const checkForUpdates = useCallback(async () => {
    if (!(await ensureLicenseValid())) return;
    const diskV = (appInfo?.experimental_addon_installed_version ?? "").trim();
    setCheckingForUpdates(true);
    try {
      const body: { license_key?: string; current_version?: string } = {};
      const key = licenseKey.trim();
      if (key) body.license_key = key;
      if (diskV) body.current_version = diskV;
      const res = await api<{
        ok: boolean;
        update_available?: boolean;
        latest_version?: string;
        current_version?: string | null;
        reason?: string;
      }>("/api/addon/update/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
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
  }, [licenseKey, savedKeySet, ensureLicenseValid, appInfo?.experimental_addon_installed_version]);

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
      ? null
      : `Up to date${updateStatus.latest_version ? ` (latest v${updateStatus.latest_version})` : ""}`
    : null;
  const showRestartRequired = updateStatus?.reason === "restart_required";

  const licenseStatusLine =
    !hasLicenseInput ? null : verifyingLicense ? (
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

  const licensePlaceholder =
    savedKeySet && !licenseKey.trim()
      ? savedKeyPreview
        ? `Saved (${savedKeyPreview}) — enter a new key to replace`
        : "License key saved — enter a new key to replace"
      : "Paste your license key from hytalemanager.com";

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
          Unlock extra features with the Experimental addon.
        </p>
      </div>

      {/* Support CTA / thank-you */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {hasFeatures ? "Thank you for supporting" : "Get the Experimental addon"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {hasFeatures
              ? "Your support helps keep development going. If you run into any problems with the addon or have feedback, please report issues on Patreon."
              : "JSON Checker, Custom Console Commands, server auto-update, and more."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasFeatures && (
            <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
              <li>
                <span className="text-foreground font-medium">Join Patreon</span>
                {" "}to become a supporter
              </li>
              <li>
                <span className="text-foreground font-medium">Connect your account</span>
                {" "}at hytalemanager.com/license and copy your key
              </li>
              <li>
                <span className="text-foreground font-medium">Paste the key below</span>
                {" "}and install the addon
              </li>
            </ol>
          )}
          <div className="flex flex-wrap gap-2">
            {!hasFeatures && (
              <a
                href={LICENSE_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                Get your license key
              </a>
            )}
            <a
              href={PATREON_URL}
              target="_blank"
              rel="noreferrer"
              className={
                hasFeatures
                  ? "inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
                  : "inline-flex items-center gap-2 rounded-lg border border-amber-600/50 bg-transparent px-4 py-2.5 text-sm font-medium text-amber-200 hover:bg-amber-500/10 transition-colors"
              }
            >
              <ExternalLink className="h-4 w-4" />
              {hasFeatures ? "Report issues on Patreon" : "Join Patreon"}
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Unified status + license + install/update */}
      {(() => {
        const addonActive = addonLoaded && hasFeatures;
        const updateAvailable =
          updateStatus?.update_available === true ||
          appInfo?.experimental_addon_update_available === true;
        const showReinstall =
          addonActive &&
          !updateAvailable &&
          (addonInstalled || appInfo?.experimental_addon_installed === true);
        const licenseLabel = !hasLicenseInput
          ? "Not set"
          : verifyingLicense
            ? "Checking…"
            : licenseVerified === true
              ? "Valid"
              : licenseVerified === false
                ? "Invalid"
                : "—";

        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Addon & license</CardTitle>
              <p className="text-sm text-muted-foreground">
                {addonActive
                  ? "Manage your license, check for updates, or uninstall."
                  : (
                    <>
                      Paste your key from{" "}
                      <a
                        href={LICENSE_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="text-foreground underline underline-offset-2 hover:text-amber-400"
                      >
                        hytalemanager.com/license
                      </a>
                      , then download and install.
                    </>
                  )}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3 text-sm">
                <div className="rounded-md border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Installed</p>
                  <p className="font-medium">{addonInstalled ? "Yes" : "No"}</p>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Loaded</p>
                  <p className="font-medium">{addonLoaded ? "Yes" : "No"}</p>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <p className="text-xs text-muted-foreground">License</p>
                  <p className="font-medium">{licenseLabel}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="experimental-license">License key</Label>
                <div className="flex gap-2">
                  <Input
                    id="experimental-license"
                    type="password"
                    placeholder={licensePlaceholder}
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <Button onClick={saveLicense} disabled={updateSettings.isPending || !licenseKey.trim()}>
                    Save
                  </Button>
                  {savedKeySet && (
                    <Button variant="outline" onClick={clearLicense} disabled={updateSettings.isPending}>
                      Remove
                    </Button>
                  )}
                </div>
                {licenseStatusLine}
              </div>

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
                {!addonActive ? (
                  <Button
                    onClick={() => void installFromSite()}
                    disabled={
                      installingFromSite || verifyingLicense || !hasLicenseInput
                    }
                  >
                    {installingFromSite ? "Downloading..." : "Download & install addon"}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={checkForUpdates}
                      disabled={
                        checkingForUpdates ||
                        installingFromSite ||
                        verifyingLicense ||
                        !hasLicenseInput
                      }
                    >
                      {checkingForUpdates ? "Checking..." : "Check for updates"}
                    </Button>
                    {updateAvailable && (
                      <Button
                        ref={updateInstallButtonRef}
                        onClick={() => void installFromSite()}
                        disabled={
                          installingFromSite || verifyingLicense || !hasLicenseInput
                        }
                        className={
                          highlightUpdateInstall ? ACTION_HIGHLIGHT_CLASS : undefined
                        }
                      >
                        {installingFromSite ? "Downloading..." : "Download & install update"}
                      </Button>
                    )}
                    {showReinstall && (
                      <Button
                        variant="outline"
                        onClick={() => void installFromSite({ forceReinstall: true })}
                        disabled={
                          installingFromSite || verifyingLicense || !hasLicenseInput
                        }
                        title="Re-download the latest addon from the site. Use if the install looks corrupted."
                      >
                        {installingFromSite ? "Downloading..." : "Reinstall addon"}
                      </Button>
                    )}
                    {addonInstalled && (
                      <Button
                        variant="outline"
                        onClick={uninstallAddon}
                        disabled={uninstallingAddon || installingFromSite}
                      >
                        {uninstallingAddon ? "Uninstalling..." : "Uninstall addon"}
                      </Button>
                    )}
                  </>
                )}
              </div>

              {autoUpdateLine && (
                <p className="text-xs text-muted-foreground">{autoUpdateLine}</p>
              )}
              {showRestartRequired && (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    Updated successfully. Restart required.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => void requestRestart()}
                  >
                    Restart
                  </Button>
                </div>
              )}
              {updateStatusText && (
                <p className="text-xs text-muted-foreground">{updateStatusText}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Restart the app after install, update, or uninstall so the addon load state refreshes.
              </p>
            </CardContent>
          </Card>
        );
      })()}

      {/* Manual .whl fallback when addon is not active yet */}
      {(!addonLoaded || !hasFeatures) && (
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

      {addonLoaded &&
        hasFeatures &&
        features.includes("auto_update") &&
        appInfo?.experimental_addon_feature_flags?.["auto_update"] !== false && (
          <ExperimentalAutoUpdateSettings />
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
