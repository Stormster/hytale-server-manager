import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useInstances } from "@/api/hooks/useInstances";
import { useLocalIp, usePublicIp } from "@/api/hooks/useInfo";
import { api } from "@/api/client";
import {
  Copy,
  Check,
  Shield,
  Zap,
  Eye,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const GAME_PORT_DEFAULT = 5520;
const NITRADO_OFFSET = 100;

function Copyable({
  text,
  children,
  className,
  tooltipLabel,
}: {
  text: string;
  children: React.ReactNode;
  className?: string;
  tooltipLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const doCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation?.();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 800);
      toast.success("Copied");
    } catch {
      toast.error("Failed to copy");
    }
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={doCopy}
          className={cn("cursor-pointer rounded transition-opacity hover:opacity-80", className)}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied" : tooltipLabel ?? "Copy"}</TooltipContent>
    </Tooltip>
  );
}

function isPrivateOrCgnat(ip: string): "private" | "cgnat" | false {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  if (parts[0] === 10) return "private";
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return "private";
  if (parts[0] === 192 && parts[1] === 168) return "private";
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return "cgnat";
  return false;
}

type FirewallStatusLabel = "Allowed" | "Blocked" | "Partially allowed" | "Unknown";
export function PortForwardingView() {
  const { data: instances, isLoading } = useInstances();
  const [firewallStatus, setFirewallStatus] = useState<Record<string, boolean>>({});
  const [firewallChecking, setFirewallChecking] = useState(false);
  const [upnpRunning, setUpnpRunning] = useState(false);
  const [upnpResult, setUpnpResult] = useState<{ results: Record<string, boolean>; discovery_ok: boolean } | null>(null);
  const [showPublicIp, setShowPublicIp] = useState(false);
  const [upnpStatus, setUpnpStatus] = useState<{ available: boolean } | null>(null);
  const [routerExpanded, setRouterExpanded] = useState(false);
  const [addRulesRunning, setAddRulesRunning] = useState(false);
  const [addRulesResult, setAddRulesResult] = useState<{ ok: boolean; added: number; message: string } | null>(null);
  const [expandedInstance, setExpandedInstance] = useState<string | null>(null);

  const { data: localIpData } = useLocalIp();
  const { data: publicIpData } = usePublicIp(true);

  const instancesWithPorts = (instances ?? []).map((inst) => ({
    name: inst.name,
    gamePort: inst.game_port ?? GAME_PORT_DEFAULT,
    webserverPort: inst.webserver_port ?? (inst.game_port ?? GAME_PORT_DEFAULT) + NITRADO_OFFSET,
  }));

  const localIp = localIpData?.ip ?? "";
  const publicIp = publicIpData?.ok ? publicIpData.ip ?? "" : "";
  const publicIpError = publicIpData && !publicIpData.ok;
  const publicIpWarning: "private" | "cgnat" | "unreachable" | null =
    publicIp ? (isPrivateOrCgnat(publicIp) || null) : publicIpError ? "unreachable" : null;

  const checkFirewall = async () => {
    if (instancesWithPorts.length === 0) return;
    const portsParam = instancesWithPorts
      .flatMap((i) => [`${i.gamePort}:UDP`, `${i.webserverPort}:TCP`])
      .join(",");
    setFirewallChecking(true);
    try {
      const status = await api<Record<string, boolean>>(`/api/firewall-status?ports=${encodeURIComponent(portsParam)}`);
      setFirewallStatus(status);
    } catch {
      setFirewallStatus({});
    } finally {
      setFirewallChecking(false);
    }
  };

  const portsKey =
    instances
      ?.map(
        (i) =>
          `${i.name}-${i.game_port ?? GAME_PORT_DEFAULT}-${i.webserver_port ?? (i.game_port ?? GAME_PORT_DEFAULT) + NITRADO_OFFSET}`
      )
      .join("|") ?? "";
  useEffect(() => {
    if (instancesWithPorts.length > 0) checkFirewall();
  }, [portsKey]);

  useEffect(() => {
    if (instancesWithPorts.length > 0) {
      api<{ available: boolean }>("/api/upnp/status")
        .then(setUpnpStatus)
        .catch(() => setUpnpStatus({ available: false }));
    } else {
      setUpnpStatus(null);
    }
  }, [portsKey]);

  const isAllowed = (port: number, protocol: string) => firewallStatus[`${port}:${protocol}`] === true;

  const getFirewallStatusLabel = (): FirewallStatusLabel => {
    if (instancesWithPorts.length === 0) return "Unknown";
    const hasData = Object.keys(firewallStatus).length > 0;
    if (!hasData) return "Unknown";
    const all = instancesWithPorts.every(
      (i) => isAllowed(i.gamePort, "UDP") && isAllowed(i.webserverPort, "TCP")
    );
    const any = instancesWithPorts.some(
      (i) => isAllowed(i.gamePort, "UDP") || isAllowed(i.webserverPort, "TCP")
    );
    if (all) return "Allowed";
    if (!any) return "Blocked";
    return "Partially allowed";
  };

  const tryUpnp = async () => {
    if (instancesWithPorts.length === 0) return;
    const ports = instancesWithPorts.flatMap((i) => [
      { port: i.gamePort, protocol: "UDP" as const },
      { port: i.webserverPort, protocol: "TCP" as const },
    ]);
    setUpnpRunning(true);
    setUpnpResult(null);
    try {
      const res = await api<{ results: Record<string, boolean>; discovery_ok: boolean }>("/api/upnp/forward", {
        method: "POST",
        body: JSON.stringify({ ports }),
      });
      setUpnpResult(res);
      if (res.discovery_ok) setUpnpStatus({ available: true });
    } catch {
      setUpnpResult({ results: {}, discovery_ok: false });
    } finally {
      setUpnpRunning(false);
    }
  };

  const addFirewallRules = async () => {
    if (instancesWithPorts.length === 0) return;
    setAddRulesRunning(true);
    setAddRulesResult(null);
    try {
      const rules = instancesWithPorts.flatMap((inst) => [
        { name: `Hytale - ${inst.name} (Game)`, port: inst.gamePort, protocol: "UDP" },
        { name: `Hytale - ${inst.name} (Web)`, port: inst.webserverPort, protocol: "TCP" },
      ]);
      const res = await api<{ ok: boolean; added: number; message: string }>("/api/firewall/add-rules", {
        method: "POST",
        body: JSON.stringify({ rules }),
      });
      setAddRulesResult(res);
      if (res.added > 0) checkFirewall();
    } catch {
      setAddRulesResult({ ok: false, added: 0, message: "Request failed" });
    } finally {
      setAddRulesRunning(false);
    }
  };

  const firstGamePort = instancesWithPorts[0]?.gamePort ?? GAME_PORT_DEFAULT;
  const firstWebPort = instancesWithPorts[0]?.webserverPort ?? firstGamePort + NITRADO_OFFSET;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">
          <div className="mb-2">
            <h2 className="text-xl font-bold">Port Forwarding</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Allow players to connect by forwarding ports on your router and opening them in Windows Firewall.
            </p>
            <nav className="flex items-center gap-2 text-sm mt-3" aria-label="Progress">
              <a href="#share-info" className="text-foreground font-medium hover:underline">
                Share info
              </a>
              <span className="text-muted-foreground/60">›</span>
              <a href="#firewall" className="text-muted-foreground hover:text-foreground hover:underline">
                Firewall
              </a>
              <span className="text-muted-foreground/60">›</span>
              <a href="#router" className="text-muted-foreground hover:text-foreground hover:underline">
                Router
              </a>
              <span className="text-muted-foreground/60">›</span>
              <a href="#verify" className="text-muted-foreground hover:text-foreground hover:underline">
                Verify
              </a>
            </nav>
          </div>

          {/* Two-column: IPs left, table right */}
          <div id="share-info" className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your IP addresses</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Local IP</span>
                  {localIp ? (
                    <Copyable text={localIp} className="flex items-center gap-1.5">
                      <code className="rounded bg-muted px-2 py-1 text-sm font-mono">{localIp}</code>
                      <Copy className="h-3.5 w-3.5" />
                    </Copyable>
                  ) : (
                    <span className="text-muted-foreground text-sm">Detecting…</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Public IP</span>
                  {showPublicIp ? (
                    <div className="flex items-center gap-2">
                      {publicIp ? (
                        <div className="flex items-center gap-1.5">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowPublicIp(false)} title="Hide public IP">
                            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Copyable text={publicIp} className="flex items-center gap-1.5">
                            <code className="rounded bg-muted px-2 py-1 text-sm font-mono">{publicIp}</code>
                            <Copy className="h-3.5 w-3.5" />
                          </Copyable>
                        </div>
                      ) : publicIpError ? (
                        <span className="text-amber-500 text-sm">Failed</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">Loading…</span>
                      )}
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => setShowPublicIp(true)}>
                      <Eye className="h-3.5 w-3.5" />
                      Reveal
                    </Button>
                  )}
                </div>
                {localIp && (
                  <div className="space-y-2 pt-2 border-t">
                    <p className="text-xs font-medium text-muted-foreground">Connection strings</p>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">LAN</span>
                        <Copyable text={`${localIp}:${firstGamePort}`} className="flex items-center gap-1">
                          <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono">{localIp}:{firstGamePort}</code>
                          <Copy className="h-3 w-3" />
                        </Copyable>
                      </div>
                      {publicIp ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">WAN</span>
                          {showPublicIp ? (
                            <div className="flex items-center gap-1.5">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => setShowPublicIp(false)} title="Hide public IP">
                                <Eye className="h-3 w-3 text-muted-foreground" />
                              </Button>
                              <Copyable text={`${publicIp}:${firstGamePort}`} className="flex items-center gap-1">
                                <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono">{publicIp}:{firstGamePort}</code>
                                <Copy className="h-3 w-3" />
                              </Copyable>
                            </div>
                          ) : (
                            <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={() => setShowPublicIp(true)}>
                              <Eye className="h-3 w-3" />
                              Reveal
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
                {publicIpWarning && (
                  <div className="flex gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-xs">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                    <p>
                      {publicIpWarning === "cgnat"
                        ? "Your ISP may be using CGNAT. Port forwarding will not work unless you get a public IPv4 or use a tunnel."
                        : publicIpWarning === "unreachable"
                          ? "Could not fetch public IP. Port forwarding may still work – try connecting from outside your network."
                          : "Public IP is private – you may be behind NAT. Router forwarding required."}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">What to forward</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">Purpose</th>
                      <th className="pb-2 pr-4">Protocol</th>
                      <th className="pb-2 pr-4">Ext. port</th>
                      <th className="pb-2">Int. port</th>
                    </tr>
                  </thead>
                  <tbody className="text-foreground">
                    <tr className="border-b">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2 flex-nowrap">
                          <span>Game traffic</span>
                          <Badge variant="secondary" className="text-[10px] shrink-0 whitespace-nowrap">
                            Recommended
                          </Badge>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4">UDP</td>
                      <td className="py-2.5 pr-4 font-mono">{firstGamePort}</td>
                      <td className="py-2.5 font-mono">{firstGamePort}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2 flex-nowrap">
                          <span>Web admin</span>
                          <Badge variant="outline" className="text-[10px] shrink-0 whitespace-nowrap">
                            Optional
                          </Badge>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4">TCP</td>
                      <td className="py-2.5 pr-4 font-mono">{firstWebPort}</td>
                      <td className="py-2.5 font-mono">{firstWebPort}</td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* Windows Firewall & Ports per instance – combined */}
          <Card id="firewall">
            <CardHeader>
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Windows Firewall & Ports per instance
                  </CardTitle>
                  <div className="flex gap-2 flex-wrap mt-2">
                    <Button
                      variant="default"
                      onClick={addFirewallRules}
                      disabled={addRulesRunning || instancesWithPorts.length === 0}
                    >
                      {addRulesRunning ? "Adding…" : "Add rules automatically"}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge
                    variant={
                      getFirewallStatusLabel() === "Allowed"
                        ? "success"
                        : getFirewallStatusLabel() === "Blocked" || getFirewallStatusLabel() === "Partially allowed"
                          ? "warning"
                          : "secondary"
                    }
                  >
                    {getFirewallStatusLabel()}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={checkFirewall}
                    disabled={firewallChecking || instancesWithPorts.length === 0}
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", firewallChecking && "animate-spin")} />
                    Check
                  </Button>
                </div>
              </div>
              {addRulesResult && (
                <p
                  className={cn(
                    "text-sm mt-2",
                    addRulesResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                  )}
                >
                  {addRulesResult.message}
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  If the automatic process fails, you can Run PowerShell or Terminal{" "}
                  <span className="text-amber-600 dark:text-amber-400 font-medium">as Administrator</span>
                  .<br></br>Paste each command from the dropdowns below to allow the ports.
                </p>
              </div>

              <div>
                {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : instancesWithPorts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No instances. Add a server first.</p>
              ) : (
                <div className="overflow-x-auto scrollbar-hide">
                  <table className="w-full text-sm table-fixed">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="w-8 py-2"></th>
                        <th className="py-2 pr-4">Instance</th>
                        <th className="py-2 pr-4">Game UDP</th>
                        <th className="py-2 pr-4">Web TCP</th>
                        <th className="py-2 pr-4">Firewall</th>
                      </tr>
                    </thead>
                    <tbody>
                      {instancesWithPorts.map((inst) => {
                        const expanded = expandedInstance === inst.name;
                        const gameAllowed = isAllowed(inst.gamePort, "UDP");
                        const webAllowed = isAllowed(inst.webserverPort, "TCP");
                        const hasFirewallData = Object.keys(firewallStatus).length > 0;
                        const gameLabel: FirewallStatusLabel = hasFirewallData ? (gameAllowed ? "Allowed" : "Blocked") : "Unknown";
                        const webLabel: FirewallStatusLabel = hasFirewallData ? (webAllowed ? "Allowed" : "Blocked") : "Unknown";
                        const instFirewallDisplay = gameLabel === webLabel ? gameLabel : `${gameLabel} / ${webLabel}`;
                        const allRules = [
                          `netsh advfirewall firewall add rule name="Hytale - ${inst.name} (Game)" dir=in action=allow protocol=UDP localport=${inst.gamePort}`,
                          `netsh advfirewall firewall add rule name="Hytale - ${inst.name} (Web)" dir=in action=allow protocol=TCP localport=${inst.webserverPort}`,
                        ].join("\n");
                        return (
                          <React.Fragment key={inst.name}>
                            <tr
                              className="border-b cursor-pointer hover:bg-muted/30"
                              onClick={() => setExpandedInstance(expanded ? null : inst.name)}
                            >
                              <td className="py-2">
                                {expanded ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                              </td>
                              <td className="py-2 pr-4 font-medium">{inst.name}</td>
                              <td className="py-2 pr-4 font-mono">{inst.gamePort}</td>
                              <td className="py-2 pr-4 font-mono">{inst.webserverPort}</td>
                              <td className="py-2 pr-4">
                                <span
                                  className={cn(
                                    "text-xs",
                                    gameLabel === "Allowed" && webLabel === "Allowed"
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : gameLabel === "Blocked" || webLabel === "Blocked"
                                        ? "text-amber-600 dark:text-amber-400"
                                        : "text-muted-foreground"
                                  )}
                                >
                                  {instFirewallDisplay}
                                </span>
                              </td>
                            </tr>
                            {expanded && (
                              <tr>
                                <td colSpan={5} className="bg-muted/20 px-6 py-4 align-top">
                                  <div className="text-sm min-w-0 overflow-hidden">
                                    <p className="font-medium mb-2">Firewall rules for {inst.name}</p>
                                    <div className="space-y-2">
                                      {[
                                        [
                                          `Hytale - ${inst.name} (Game)`,
                                          inst.gamePort,
                                          "UDP",
                                          gameAllowed,
                                        ],
                                        [
                                          `Hytale - ${inst.name} (Web)`,
                                          inst.webserverPort,
                                          "TCP",
                                          webAllowed,
                                        ],
                                      ].map(([name, port, proto, allowed]) => {
                                        const cmd = `netsh advfirewall firewall add rule name="${name}" dir=in action=allow protocol=${proto} localport=${port}`;
                                        return (
                                          <div key={String(port)} className="flex items-center gap-2 min-w-0">
                                            <Copyable
                                              text={cmd}
                                              tooltipLabel={allowed ? "Allowed" : undefined}
                                              className="min-w-0 w-full max-w-full"
                                            >
                                              <div
                                                className={cn(
                                                  "flex items-center rounded border min-w-0 w-full overflow-hidden transition-colors scrollbar-hide",
                                                  allowed
                                                    ? "bg-emerald-500/15 border-emerald-500/40"
                                                    : "bg-muted/80 border-border/60"
                                                )}
                                              >
                                                <span
                                                  className={cn(
                                                    "shrink-0 p-2 transition-colors",
                                                    allowed ? "text-emerald-600 dark:text-emerald-400" : "hover:bg-muted/80"
                                                  )}
                                                >
                                                  {allowed ? (
                                                    <Check className="h-3.5 w-3.5" />
                                                  ) : (
                                                    <Copy className="h-3.5 w-3.5" />
                                                  )}
                                                </span>
                                                <pre className="flex-1 min-w-0 overflow-x-auto scrollbar-hide px-3 py-2 text-xs font-mono select-text whitespace-nowrap">
                                                  {cmd}
                                                </pre>
                                              </div>
                                            </Copyable>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    <Copyable text={allRules}>
                                      <Button variant="ghost" size="sm" className="gap-2 mt-2">
                                        <Copy className="h-3.5 w-3.5" />
                                        Copy all rules
                                      </Button>
                                    </Copyable>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              </div>
            </CardContent>
          </Card>

          {/* UPnP – Router */}
          <Card id="router">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Try UPnP (automatic)
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ask your router to forward ports automatically via UPnP. Works only if UPnP is enabled on your router.
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Results vary by router — if UPnP fails or players still cannot connect, use the manual forwarding steps below.
                  </p>
                </div>
                <Button
                  variant="default"
                  onClick={tryUpnp}
                  disabled={upnpRunning || instancesWithPorts.length === 0}
                >
                  {upnpRunning ? "Trying…" : "Try UPnP"}
                </Button>
              </div>
            </CardHeader>
            {upnpResult && (
              <CardContent className="pt-0">
                {upnpResult.discovery_ok ? (
                  <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 p-3 text-sm">
                    Success – router port forwarding added. Allow these ports in Windows Firewall (step above).
                  </div>
                ) : (
                  <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 text-sm">
                    Failed – enable UPnP on your router or use manual forwarding.
                    <p className="mt-1 text-xs opacity-90">No UPnP device found or router rejected the request. Only works if UPnP is enabled on the router.</p>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* Verify external access */}
          <Card id="verify">
            <CardHeader>
              <CardTitle className="text-base">Verify external access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Most port checker sites only test TCP. Your game port is UDP, so the only reliable test is a real connection attempt from outside your network.
              </p>

              <div>
                <p className="font-medium text-foreground mb-1">UDP & TCP port checker</p>
                <p className="text-sm text-muted-foreground mb-2">
                  Test from multiple locations worldwide. Open or filtered = good; Connection refused or timeout = port not reachable.
                </p>
                <p className="text-xs text-amber-600/90 dark:text-amber-400/90 mb-2">
                  Sharing your IP with external sites (or people you don't know) has privacy and security risks.
                </p>
                {publicIp ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {(instancesWithPorts.length > 0 ? instancesWithPorts : [{ name: "Game", gamePort: firstGamePort, webserverPort: firstWebPort }]).map((inst) => (
                        <div key={inst.name} className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium w-24 shrink-0">{inst.name}</span>
                          <a
                            href={`https://check-host.net/check-udp?host=${encodeURIComponent(`${publicIp}:${inst.gamePort}`)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex"
                          >
                            <Button variant="outline" size="sm" className="gap-1.5 h-8">
                              <ExternalLink className="h-3 w-3" />
                              UDP {inst.gamePort}
                            </Button>
                          </a>
                          <a
                            href={`https://check-host.net/check-tcp?host=${encodeURIComponent(`${publicIp}:${inst.webserverPort}`)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex"
                          >
                            <Button variant="ghost" size="sm" className="gap-1.5 h-8">
                              <ExternalLink className="h-3 w-3" />
                              TCP {inst.webserverPort}
                            </Button>
                          </a>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This program is not affiliated with check-host.net. Links open an external third-party site.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-muted-foreground italic">
                      {publicIpError ? "Could not fetch public IP." : "Loading your public IP…"}
                    </p>
                    {publicIpError && (
                      <Button variant="ghost" size="sm" onClick={() => setShowPublicIp(true)}>
                        Retry
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <p className="font-medium text-foreground mb-2">Best test: ask a friend</p>
                <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                  <li>Start your server</li>
                  <li className="flex flex-wrap items-center gap-2 gap-y-1">
                    <span>Copy and send your public address:</span>
                    {showPublicIp ? (
                      publicIp ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => setShowPublicIp(false)} title="Hide public IP">
                            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Copyable text={`${publicIp}:${firstGamePort}`} className="inline-flex items-center gap-1.5">
                            <code className="rounded bg-muted px-2 py-1 text-sm font-mono">{publicIp}:{firstGamePort}</code>
                            <Copy className="h-3.5 w-3.5" />
                          </Copyable>
                        </span>
                      ) : publicIpError ? (
                        <span className="text-amber-500">Failed</span>
                      ) : (
                        <span className="italic">Loading…</span>
                      )
                    ) : (
                      <Button variant="ghost" size="sm" className="h-7 gap-1 -ml-2" onClick={() => setShowPublicIp(true)}>
                        <Eye className="h-3.5 w-3.5" />
                        Reveal
                      </Button>
                    )}
                  </li>
                  <li>Have a friend connect from a different network</li>
                  <li>If it works, you're done</li>
                </ol>
              </div>

              {publicIpWarning && (
                <div className="flex gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 p-3 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                  <p>
                    {publicIpWarning === "cgnat"
                      ? "Your ISP may be using CGNAT. Port forwarding will not work unless you get a public IPv4 or use a tunnel."
                      : publicIpWarning === "unreachable"
                        ? "Could not fetch public IP. Port forwarding may still work – try connecting from outside your network."
                        : "Public IP is private – you may be behind NAT. Router forwarding required."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 8. Manual router – accordion at bottom */}
          <details
            className="group rounded-lg border"
            open={routerExpanded}
            onToggle={(e) => setRouterExpanded((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer list-none px-4 py-3 font-medium flex items-center gap-2 hover:bg-muted/30 rounded-lg">
              <ChevronRight className="h-4 w-4 group-open:rotate-90 transition-transform" />
              Manual router setup
            </summary>
            <div className="px-4 pb-4 pt-1">
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Find your local IP (see above) or run <code className="rounded bg-muted px-1 font-mono">ipconfig</code></li>
                <li>Open your router (e.g. 192.168.1.1)</li>
                <li>Add UDP rule: game port → local IP</li>
                <li>Add TCP rule: web port → local IP (optional)</li>
                <li>Port shows open only when server is running</li>
              </ol>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
