import {
  LayoutDashboard,
  Terminal,
  Download,
  Archive,
  Settings,
  FileText,
  Package,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InstanceSwitcher } from "@/components/InstanceSwitcher";

export type ViewName =
  | "dashboard"
  | "server"
  | "updates"
  | "backups"
  | "mods"
  | "config"
  | "port-forwarding"
  | "settings";

interface NavItem {
  name: ViewName;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const topNav: NavItem[] = [
  { name: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { name: "server", label: "Console", icon: Terminal },
  { name: "updates", label: "Updates", icon: Download },
  { name: "backups", label: "Backups", icon: Archive },
  { name: "mods", label: "Mods", icon: Package },
  { name: "config", label: "Configuration", icon: FileText },
  { name: "port-forwarding", label: "Port Forwarding", icon: Shield },
];

const bottomNav: NavItem[] = [
  { name: "settings", label: "Settings", icon: Settings },
];

interface AppSidebarProps {
  active: ViewName;
  onNavigate: (view: ViewName) => void;
  onAddServer: () => void;
  onImportServer: () => void;
  onManageInstances: () => void;
}

export function AppSidebar({
  active,
  onNavigate,
  onAddServer,
  onImportServer,
  onManageInstances,
}: AppSidebarProps) {
  return (
    <aside className="relative z-20 flex h-full w-[260px] flex-col border-r border-white/10 bg-card/80 backdrop-blur-md">
      <InstanceSwitcher
        onAddServer={onAddServer}
        onImportServer={onImportServer}
        onManageInstances={onManageInstances}
      />

      <div className="my-3 mx-4 h-px bg-border" />

      <nav className="flex-1 space-y-0.5 px-2">
        {topNav.map((item) => (
          <SidebarButton
            key={item.name}
            item={item}
            active={active === item.name}
            onClick={() => onNavigate(item.name)}
          />
        ))}
      </nav>

      <nav className="space-y-0.5 px-2 pb-2">
        {bottomNav.map((item) => (
          <SidebarButton
            key={item.name}
            item={item}
            active={active === item.name}
            onClick={() => onNavigate(item.name)}
          />
        ))}
        <a
          href="https://github.com/Stormster/hytale-server-manager/issues"
          target="_blank"
          rel="noreferrer"
          className="block px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
        >
          Report issues
        </a>
      </nav>
    </aside>
  );
}

function SidebarButton({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
    </button>
  );
}
