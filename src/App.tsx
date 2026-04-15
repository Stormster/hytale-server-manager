import { useState, useEffect } from "react";
import { AppSidebar, type ViewName } from "@/components/AppSidebar";
import { AuthExpiredBanner } from "@/components/AuthExpiredBanner";
import { DownloaderMissingBanner } from "@/components/DownloaderMissingBanner";
import { DashboardView } from "@/views/DashboardView";
import { ServerView } from "@/views/ServerView";
import { UpdateView } from "@/views/UpdateView";
import { BackupView } from "@/views/BackupView";
import { ModsView } from "@/views/ModsView";
import { ConfigView } from "@/views/ConfigView";
import { PortForwardingView } from "@/views/PortForwardingView";
import { SettingsView } from "@/views/SettingsView";
import { ExperimentalView } from "@/views/ExperimentalView";
import { OnboardingView } from "@/views/OnboardingView";
import { AuthRequiredView } from "@/views/AuthRequiredView";
import { AddServerDialog } from "@/components/AddServerDialog";
import { AppFooter } from "@/components/AppFooter";
import { ImportServerDialog } from "@/components/ImportServerDialog";
import { InstancesModal } from "@/components/InstancesModal";
import { Loader2 } from "lucide-react";
import { useSettings } from "@/api/hooks/useSettings";
import { useAuthStatus } from "@/api/hooks/useAuth";
import { clearBackendUrlCache } from "@/api/client";
import { useAggregatedPendingUpdates } from "@/api/hooks/useAggregatedUpdates";

export default function App() {
  const { data: settings, isLoading, isError, refetch } = useSettings();
  const { data: authStatus, isLoading: authLoading, isError: authError, refetch: refetchAuth } = useAuthStatus();
  const { pendingCount: updatesPendingCount } = useAggregatedPendingUpdates();
  const [activeView, setActiveView] = useState<ViewName>("dashboard");
  const [experimentalScrollTo, setExperimentalScrollTo] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [manageInstancesOpen, setManageInstancesOpen] = useState(false);

  // Graceful shutdown: stop all servers before closing (Tauri only). Must be before any early returns.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { api } = await import("@/api/client");
        const win = getCurrentWindow();
        unlisten = await win.onCloseRequested(async (event) => {
          event.preventDefault();
          const CLOSE_TIMEOUT = 8000; // Max wait before force-close
          const deadline = Date.now() + CLOSE_TIMEOUT;
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            const port = await invoke<number>("get_backend_port");
            const url = `http://127.0.0.1:${port}`;
            const ctrl = new AbortController();
            const timeoutId = setTimeout(() => ctrl.abort(), CLOSE_TIMEOUT);
            try {
              await fetch(`${url}/api/server/stop`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ all: true }),
                signal: ctrl.signal,
              });
              while (Date.now() < deadline) {
                try {
                  const res = await fetch(`${url}/api/server/status`, { signal: ctrl.signal });
                  const status = await res.json();
                  if (!status?.running) break;
                } catch {
                  break;
                }
                await new Promise((r) => setTimeout(r, 400));
              }
            } finally {
              clearTimeout(timeoutId);
            }
          } catch {
            // Backend unreachable or not ready – close anyway
          }
          try {
            await win.destroy();
          } catch {
            // destroy() failed – try close() as fallback
            try {
              await win.close();
            } catch {
              // Give up; Tauri RunEvent::ExitRequested will clean up
            }
          }
        });
      } catch {
        // Not in Tauri (browser dev)
      }
    })();
    return () => unlisten?.();
  }, []);

  // Show error with retry when backend connection fails (e.g. WSL/VM graphics issues)
  if (isError || authError) {
    const retry = () => {
      clearBackendUrlCache();
      refetch();
      refetchAuth();
    };
    return (
      <div className="relative flex h-screen w-screen flex-col">
        <div className="hytale-bg">
          <div className="hytale-bg-image" />
          <div className="hytale-bg-overlay" />
        </div>
        <div className="relative z-0 flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-sm text-destructive">
            Could not connect to the backend.
          </p>
          <p className="text-xs text-muted-foreground max-w-md text-center">
            On WSL or VMs, try: LIBGL_AL_SOFTWARE=1 ./server-manager
          </p>
          <button
            type="button"
            onClick={retry}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Retry
          </button>
          <a
            href="https://github.com/Stormster/hytale-server-manager/issues"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Report issue
          </a>
        </div>
        <AppFooter />
      </div>
    );
  }

  // Show loading while settings and auth are being fetched
  if (isLoading || authLoading) {
    return (
      <div className="relative flex h-screen w-screen flex-col">
        <div className="hytale-bg">
          <div className="hytale-bg-image" />
          <div className="hytale-bg-overlay" />
        </div>
        <div className="relative z-0 flex flex-1 flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
        <AppFooter />
      </div>
    );
  }

  // Show onboarding first on fresh install (before directory selection and auth)
  if (!settings?.onboarding_completed || !settings?.root_dir) {
    return <OnboardingView />;
  }

  // Show auth required if not authenticated (needed for downloads)
  if (!authStatus?.has_credentials) {
    return <AuthRequiredView />;
  }

  const handleNavigate = (view: ViewName, scrollTo?: string) => {
    setActiveView(view);
    if (view === "experimental" && scrollTo) setExperimentalScrollTo(scrollTo);
  };

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden select-none">
      <div className="hytale-bg">
        <div className="hytale-bg-image" />
        <div className="hytale-bg-overlay" />
      </div>
      <div className="relative z-10 flex flex-1 overflow-hidden">
        <AppSidebar
          active={activeView}
          onNavigate={handleNavigate}
          onAddServer={() => setAddOpen(true)}
          onImportServer={() => setImportOpen(true)}
          onManageInstances={() => setManageInstancesOpen(true)}
          updatesPendingCount={updatesPendingCount}
        />
        <main className="relative z-0 flex flex-1 flex-col overflow-hidden">
          <AuthExpiredBanner
            onNavigateToSettings={() => handleNavigate("settings")}
          />
          <DownloaderMissingBanner
            onNavigateToSettings={() => handleNavigate("settings")}
          />
          <div className="flex-1 overflow-y-auto">
          {activeView === "dashboard" && (
            <DashboardView
              onNavigate={handleNavigate}
              onAddServer={() => setAddOpen(true)}
              onImportServer={() => setImportOpen(true)}
            />
          )}
          {activeView === "server" && (
            <ServerView
              onNavigate={handleNavigate}
              onNavigateToCustomCommands={() => handleNavigate("experimental", "custom-commands")}
            />
          )}
          {activeView === "updates" && <UpdateView onNavigate={handleNavigate} />}
          {activeView === "backups" && <BackupView onNavigate={handleNavigate} />}
          {activeView === "mods" && <ModsView />}
          {activeView === "config" && <ConfigView />}
          {activeView === "port-forwarding" && <PortForwardingView />}
          {activeView === "experimental" && (
            <ExperimentalView
              scrollToSection={experimentalScrollTo}
              onScrollDone={() => setExperimentalScrollTo(null)}
            />
          )}
          {activeView === "settings" && <SettingsView />}
          </div>
        </main>
      </div>
      <AppFooter onNavigateToExperimental={() => handleNavigate("experimental")} />

      <AddServerDialog open={addOpen} onOpenChange={setAddOpen} />
      <ImportServerDialog open={importOpen} onOpenChange={setImportOpen} />
      <InstancesModal
        open={manageInstancesOpen}
        onOpenChange={setManageInstancesOpen}
        onAddServer={() => setAddOpen(true)}
        onImportServer={() => setImportOpen(true)}
      />
    </div>
  );
}
