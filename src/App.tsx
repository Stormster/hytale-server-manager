import { useState } from "react";
import { AppSidebar, type ViewName } from "@/components/AppSidebar";
import { DashboardView } from "@/views/DashboardView";
import { ServerView } from "@/views/ServerView";
import { UpdateView } from "@/views/UpdateView";
import { BackupView } from "@/views/BackupView";
import { ConfigView } from "@/views/ConfigView";
import { SettingsView } from "@/views/SettingsView";
import { OnboardingView } from "@/views/OnboardingView";
import { AddServerDialog } from "@/components/AddServerDialog";
import { ImportServerDialog } from "@/components/ImportServerDialog";
import { InstancesModal } from "@/components/InstancesModal";
import { InstanceSettingsModal } from "@/components/InstanceSettingsModal";
import { useSettings } from "@/api/hooks/useSettings";

export default function App() {
  const { data: settings, isLoading } = useSettings();
  const [activeView, setActiveView] = useState<ViewName>("dashboard");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [manageInstancesOpen, setManageInstancesOpen] = useState(false);
  const [manageInstanceOpen, setManageInstanceOpen] = useState(false);

  // Show loading while settings are being fetched
  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Show onboarding if root_dir is not configured
  if (!settings?.root_dir) {
    return <OnboardingView />;
  }

  const handleNavigate = (view: ViewName) => {
    setActiveView(view);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden select-none">
      <AppSidebar
        active={activeView}
        onNavigate={handleNavigate}
        onAddServer={() => setAddOpen(true)}
        onImportServer={() => setImportOpen(true)}
        onManageInstances={() => setManageInstancesOpen(true)}
      />
      <main className="flex-1 overflow-y-auto">
        {activeView === "dashboard" && (
          <DashboardView onNavigate={handleNavigate} />
        )}
        {activeView === "server" && <ServerView />}
        {activeView === "updates" && <UpdateView />}
        {activeView === "backups" && <BackupView />}
        {activeView === "config" && <ConfigView />}
        {activeView === "settings" && (
          <SettingsView onManageInstance={() => setManageInstanceOpen(true)} />
        )}
      </main>

      <AddServerDialog open={addOpen} onOpenChange={setAddOpen} />
      <ImportServerDialog open={importOpen} onOpenChange={setImportOpen} />
      <InstancesModal
        open={manageInstancesOpen}
        onOpenChange={setManageInstancesOpen}
        onAddServer={() => setAddOpen(true)}
        onImportServer={() => setImportOpen(true)}
      />
      <InstanceSettingsModal
        open={manageInstanceOpen}
        onOpenChange={setManageInstanceOpen}
      />
    </div>
  );
}
