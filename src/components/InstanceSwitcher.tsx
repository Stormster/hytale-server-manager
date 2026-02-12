import { useState, useRef, useEffect } from "react";
import { Server, ChevronDown, Plus, FolderInput, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useInstances, useSetActiveInstance } from "@/api/hooks/useInstances";
import { useSettings } from "@/api/hooks/useSettings";
import { useServerStatus } from "@/api/hooks/useServer";
import type { Instance } from "@/api/types";

interface InstanceSwitcherProps {
  onAddServer: () => void;
  onImportServer: () => void;
  onManageInstances: () => void;
}

export function InstanceSwitcher({
  onAddServer,
  onImportServer,
  onManageInstances,
}: InstanceSwitcherProps) {
  const { data: instances } = useInstances();
  const { data: settings } = useSettings();
  const { data: serverStatus } = useServerStatus();
  const setActive = useSetActiveInstance();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  const activeInstance = settings?.active_instance || "";
  const activeInstanceLabel = activeInstance || "No instance";
  const hasMultiple = (instances?.length ?? 0) >= 2;
  const running = serverStatus?.running ?? false;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  const filteredInstances = (instances ?? []).filter((inst) =>
    inst.name.toLowerCase().includes(search.toLowerCase().trim())
  );

  const handleSelectInstance = (name: string) => {
    setActive.mutate(name);
    setOpen(false);
  };

  const getInstanceStatus = (inst: Instance) => {
    if (inst.name !== activeInstance) return "Stopped";
    return running ? "Running" : "Stopped";
  };

  // Single instance: show name, no chevron; whole area clickable to open popover (Add/Import/Manage)
  if (!hasMultiple) {
    return (
      <div ref={popoverRef} className="relative px-2 pt-3">
        <button
          onClick={() => setOpen(!open)}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors",
            "hover:bg-accent/50",
            open && "bg-accent/50"
          )}
        >
          <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-3 text-sm font-medium leading-tight">
              {activeInstanceLabel}
            </p>
          </div>
          {/* No chevron for single instance */}
        </button>

        {open && (
          <InstancePopoverContent
            filteredInstances={filteredInstances}
            activeInstance={activeInstance}
            getInstanceStatus={getInstanceStatus}
            onSelect={handleSelectInstance}
            onAddServer={() => {
              setOpen(false);
              onAddServer();
            }}
            onImportServer={() => {
              setOpen(false);
              onImportServer();
            }}
            onManageInstances={() => {
              setOpen(false);
              onManageInstances();
            }}
            search={search}
            onSearchChange={setSearch}
            showSearch={false}
            showInstanceList={false}
          />
        )}
      </div>
    );
  }

  // Multi instance: show chevron, full popover
  return (
    <div ref={popoverRef} className="relative px-2 pt-3">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors",
          "hover:bg-accent/50",
          open && "bg-accent/50"
        )}
      >
        <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-3 text-sm font-medium leading-tight">
            {activeInstanceLabel}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <InstancePopoverContent
          filteredInstances={filteredInstances}
          activeInstance={activeInstance}
          getInstanceStatus={getInstanceStatus}
          onSelect={handleSelectInstance}
          onAddServer={() => {
            setOpen(false);
            onAddServer();
          }}
          onImportServer={() => {
            setOpen(false);
            onImportServer();
          }}
          onManageInstances={() => {
            setOpen(false);
            onManageInstances();
          }}
          search={search}
          onSearchChange={setSearch}
        />
      )}
    </div>
  );
}

function InstancePopoverContent({
  filteredInstances,
  activeInstance,
  getInstanceStatus,
  onSelect,
  onAddServer,
  onImportServer,
  onManageInstances,
  search,
  onSearchChange,
  showSearch = true,
  showInstanceList = true,
}: {
  filteredInstances: Instance[];
  activeInstance: string;
  getInstanceStatus: (inst: Instance) => string;
  onSelect: (name: string) => void;
  onAddServer: () => void;
  onImportServer: () => void;
  onManageInstances: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  showSearch?: boolean;
  showInstanceList?: boolean;
}) {
  return (
    <div className="absolute left-2 right-2 top-full z-50 mt-1 w-[260px] rounded-lg border bg-popover p-0 shadow-lg">
      {/* Search */}
      {showSearch && (
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search instances…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-md border-0 bg-muted/50 py-2 pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
      )}

      {/* Instance list */}
      {showInstanceList && (
      <div className="max-h-[220px] overflow-y-auto p-1">
        {filteredInstances.length > 0 ? (
          filteredInstances.map((inst) => {
            const status = getInstanceStatus(inst);
            return (
              <button
                key={inst.name}
                onClick={() => onSelect(inst.name)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                  inst.name === activeInstance
                    ? "bg-accent text-accent-foreground"
                    : "text-popover-foreground hover:bg-accent/50"
                )}
              >
                <Server className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-3 font-medium">{inst.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {status}
                    {inst.installed && ` · v${inst.version}`}
                  </p>
                </div>
              </button>
            );
          })
        ) : (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">
            No instances match
          </p>
        )}
      </div>
      )}

      {(showSearch || showInstanceList) && <Separator />}

      {/* Bottom actions */}
      <div className="p-1">
        <button
          onClick={onAddServer}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add new
        </button>
        <button
          onClick={onImportServer}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground transition-colors"
        >
          <FolderInput className="h-3.5 w-3.5" />
          Import existing
        </button>
        <button
          onClick={onManageInstances}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground transition-colors"
        >
          Manage instances…
        </button>
      </div>
    </div>
  );
}
