import {
  LayoutDashboard,
  Terminal,
  Download,
  Archive,
  Settings,
  FileText,
  Package,
  Shield,
  Sparkles,
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
  | "experimental"
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
  { name: "experimental", label: "Experimental", icon: Sparkles },
  { name: "settings", label: "Settings", icon: Settings },
];

interface AppSidebarProps {
  active: ViewName;
  onNavigate: (view: ViewName) => void;
  onAddServer: () => void;
  onImportServer: () => void;
  onManageInstances: () => void;
  /** When > 0, show a count badge on the Updates nav item. */
  updatesPendingCount?: number;
}

export function AppSidebar({
  active,
  onNavigate,
  onAddServer,
  onImportServer,
  onManageInstances,
  updatesPendingCount = 0,
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
            badge={item.name === "updates" ? updatesPendingCount : undefined}
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
      </nav>
    </aside>
  );
}

function SidebarButton({
  item,
  active,
  badge,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  const Icon = item.icon;
  const showBadge = typeof badge === "number" && badge > 0;
  const badgeText = badge != null && badge > 9 ? "9+" : String(badge ?? "");
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
      <span className="flex-1 text-left">{item.label}</span>
      {showBadge && (
        <span
          className={cn(
            "flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none",
            active ? "bg-primary text-primary-foreground" : "bg-amber-500/90 text-amber-950"
          )}
          title="Pending updates"
        >
          {badgeText}
        </span>
      )}
    </button>
  );
}
