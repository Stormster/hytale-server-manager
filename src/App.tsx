import { useState } from "react";
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
