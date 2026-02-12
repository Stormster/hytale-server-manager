import { useState, useEffect } from "react";
import { AppSidebar, type ViewName } from "@/components/AppSidebar";
import { DashboardView } from "@/views/DashboardView";
import { ServerView } from "@/views/ServerView";
import { UpdateView } from "@/views/UpdateView";
import { BackupView } from "@/views/BackupView";
import { ModsView } from "@/views/ModsView";
import { ConfigView } from "@/views/ConfigView";
import { SettingsView } from "@/views/SettingsView";
import { OnboardingView } from "@/views/OnboardingView";
import { AuthRequiredView } from "@/views/AuthRequiredView";
import { AddServerDialog } from "@/components/AddServerDialog";
import { ImportServerDialog } from "@/components/ImportServerDialog";
import { InstancesModal } from "@/components/InstancesModal";
import { useSettings } from "@/api/hooks/useSettings";
import { useAuthStatus } from "@/api/hooks/useAuth";

export default function App() {
  const { data: settings, isLoading } = useSettings();
  const { data: authStatus, isLoading: authLoading } = useAuthStatus();
  const [activeView, setActiveView] = useState<ViewName>("dashboard");
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

  // Show loading while settings and auth are being fetched
  if (isLoading || authLoading) {
    return (
      <div className="relative flex h-screen w-screen items-center justify-center">
        <div className="hytale-bg">
          <div className="hytale-bg-image" />
          <div className="hytale-bg-overlay" />
        </div>
        <p className="relative text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Show onboarding if root_dir is not configured
  if (!settings?.root_dir) {
    return <OnboardingView />;
  }

  // Show auth required if not authenticated (needed for downloads)
  if (!authStatus?.has_credentials) {
    return <AuthRequiredView />;
  }

  const handleNavigate = (view: ViewName) => {
    setActiveView(view);
  };

  return (
    <div className="relative flex h-screen w-screen overflow-hidden select-none">
      <div className="hytale-bg">
        <div className="hytale-bg-image" />
        <div className="hytale-bg-overlay" />
      </div>
      <AppSidebar
        active={activeView}
        onNavigate={handleNavigate}
        onAddServer={() => setAddOpen(true)}
        onImportServer={() => setImportOpen(true)}
        onManageInstances={() => setManageInstancesOpen(true)}
      />
      <main className="relative z-0 flex-1 overflow-y-auto">
        {activeView === "dashboard" && (
          <DashboardView onNavigate={handleNavigate} />
        )}
        {activeView === "server" && <ServerView />}
        {activeView === "updates" && <UpdateView />}
        {activeView === "backups" && <BackupView />}
        {activeView === "mods" && <ModsView />}
        {activeView === "config" && <ConfigView />}
        {activeView === "settings" && <SettingsView />}
      </main>

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
