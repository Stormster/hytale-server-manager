import { useState, useRef, useEffect } from "react";
import {
  LayoutDashboard,
  Terminal,
  Download,
  Archive,
  Settings,
  FileText,
  ChevronDown,
  Plus,
  FolderInput,
  Server,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useInstances, useSetActiveInstance } from "@/api/hooks/useInstances";
import { useSettings } from "@/api/hooks/useSettings";

export type ViewName =
  | "dashboard"
  | "server"
  | "updates"
  | "backups"
  | "config"
  | "settings";

interface NavItem {
  name: ViewName;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const topNav: NavItem[] = [
  { name: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { name: "server", label: "Server", icon: Terminal },
  { name: "updates", label: "Updates", icon: Download },
  { name: "backups", label: "Backups", icon: Archive },
  { name: "config", label: "Configuration", icon: FileText },
];

const bottomNav: NavItem[] = [
  { name: "settings", label: "Settings", icon: Settings },
];

interface AppSidebarProps {
  active: ViewName;
  onNavigate: (view: ViewName) => void;
  onAddServer: () => void;
  onImportServer: () => void;
}

export function AppSidebar({
  active,
  onNavigate,
  onAddServer,
  onImportServer,
}: AppSidebarProps) {
  const { data: settings } = useSettings();
  const { data: instances } = useInstances();
  const setActive = useSetActiveInstance();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeInstance = settings?.active_instance || "";

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [dropdownOpen]);

  const handleSelectInstance = (name: string) => {
    setActive.mutate(name);
    setDropdownOpen(false);
  };

  return (
    <aside className="flex h-full w-[200px] flex-col border-r bg-card">
      {/* Instance selector */}
      <div className="relative px-2 pt-3" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors",
            "hover:bg-accent/50",
            dropdownOpen && "bg-accent/50"
          )}
        >
          <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-tight">
              {activeInstance || "No instance"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Hytale Server Manager
            </p>
          </div>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              dropdownOpen && "rotate-180"
            )}
          />
        </button>

        {dropdownOpen && (
          <div className="absolute left-2 right-2 top-full z-50 mt-1 rounded-lg border bg-popover p-1 shadow-lg">
            {/* Instance list */}
            {instances && instances.length > 0 && (
              <div className="max-h-[200px] overflow-y-auto">
                {instances.map((inst) => (
                  <button
                    key={inst.name}
                    onClick={() => handleSelectInstance(inst.name)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                      inst.name === activeInstance
                        ? "bg-accent text-accent-foreground"
                        : "text-popover-foreground hover:bg-accent/50"
                    )}
                  >
                    <Server className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{inst.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {inst.installed
                          ? `v${inst.version} (${inst.patchline})`
                          : "Not installed"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {instances && instances.length > 0 && (
              <Separator className="my-1" />
            )}

            {/* Actions */}
            <button
              onClick={() => {
                setDropdownOpen(false);
                onAddServer();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Server
            </button>
            <button
              onClick={() => {
                setDropdownOpen(false);
                onImportServer();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground transition-colors"
            >
              <FolderInput className="h-3.5 w-3.5" />
              Import Existing
            </button>
          </div>
        )}
      </div>

      <Separator className="mx-4 my-3 w-auto" />

      {/* Top nav */}
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

      {/* Bottom nav */}
      <nav className="space-y-0.5 px-2 pb-2">
        {bottomNav.map((item) => (
          <SidebarButton
            key={item.name}
            item={item}
            active={active === item.name}
            onClick={() => onNavigate(item.name)}
          />
        ))}
        <p className="px-3 py-2 text-[11px] text-muted-foreground">
          HytaleLife.com
        </p>
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
