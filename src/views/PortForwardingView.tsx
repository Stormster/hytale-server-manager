import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useInstances } from "@/api/hooks/useInstances";
import { api } from "@/api/client";
import { Copy, Shield, Globe, Terminal, RefreshCw, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const GAME_PORT_DEFAULT = 5520;
const NITRADO_OFFSET = 100;

function Copyable({ text, children, className }: { text: string; children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 800);
    } catch {
      // Ignore
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
      <TooltipContent>{copied ? "Copied" : "Copy"}</TooltipContent>
    </Tooltip>
  );
}

export function PortForwardingView() {
  const { data: instances, isLoading } = useInstances();
  const [firewallStatus, setFirewallStatus] = useState<Record<string, boolean>>({});
  const [firewallChecking, setFirewallChecking] = useState(false);
  const [upnpRunning, setUpnpRunning] = useState(false);
  const [upnpResult, setUpnpResult] = useState<{ results: Record<string, boolean>; discovery_ok: boolean } | null>(null);

  const instancesWithPorts = (instances ?? []).map((inst) => ({
    name: inst.name,
    gamePort: inst.game_port ?? GAME_PORT_DEFAULT,
    webserverPort: inst.webserver_port ?? (inst.game_port ?? GAME_PORT_DEFAULT) + NITRADO_OFFSET,
  }));

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

  const portsKey = instances
    ?.map((i) => `${i.name}-${i.game_port ?? GAME_PORT_DEFAULT}-${i.webserver_port ?? (i.game_port ?? GAME_PORT_DEFAULT) + NITRADO_OFFSET}`)
    .join("|") ?? "";
  useEffect(() => {
    if (instancesWithPorts.length > 0) checkFirewall();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checkFirewall uses instancesWithPorts from closure
  }, [portsKey]);

  const isAllowed = (port: number, protocol: string) => firewallStatus[`${port}:${protocol}`] === true;

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
    } catch {
      setUpnpResult({ results: {}, discovery_ok: false });
    } finally {
      setUpnpRunning(false);
    }
  };

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold">Port Forwarding</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Allow players to connect by forwarding ports on your router and opening them in Windows Firewall.
        </p>
      </div>

      <ScrollArea className="flex-1 min-h-0 pr-4">
        <div className="space-y-6">
          {/* Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4" />
                What to forward
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                Each server instance needs two ports forwarded to your computer&apos;s local IP:
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>
                  <strong className="text-foreground">Game port (UDP)</strong> — Players connect here. Hytale uses QUIC over UDP.
                </li>
                <li>
                  <strong className="text-foreground">Nitrado web port (TCP)</strong> — Optional web admin panel. Required for player counts and other stats.
                </li>
              </ul>
              <p className="text-muted-foreground">
                Forward both internal and external ports to the same numbers. Use your local IP (<code className="rounded bg-muted px-1">ipconfig</code> on Windows).
              </p>
            </CardContent>
          </Card>

          {/* UPnP automatic */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Try UPnP (automatic)
                </CardTitle>
                <Button
                  variant="default"
                  size="sm"
                  onClick={tryUpnp}
                  disabled={upnpRunning || instancesWithPorts.length === 0}
                >
                  {upnpRunning ? "Trying…" : "Try UPnP"}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Ask your router to forward ports automatically via UPnP. Works only if UPnP is enabled on your router.
              </p>
            </CardHeader>
            {upnpResult && (
              <CardContent className="pt-0">
                {upnpResult.discovery_ok ? (
                  <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 p-3 text-sm">
                    <p className="font-medium text-foreground mb-1">Router port forwarding added:</p>
                    <ul className="text-muted-foreground space-y-0.5">
                      {Object.entries(upnpResult.results)
                        .filter(([, ok]) => ok)
                        .map(([key]) => (
                          <li key={key}>{key}</li>
                        ))}
                    </ul>
                    {Object.entries(upnpResult.results).some(([, ok]) => !ok) && (
                      <p className="mt-2 text-amber-500 text-xs">Some ports could not be added (may already be mapped).</p>
                    )}
                    <p className="mt-2 text-muted-foreground text-xs">
                      You still need to allow these ports in Windows Firewall — see the commands below.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-amber-600 dark:text-amber-400">
                    No UPnP device found, or router rejected the request. Enable UPnP in your router settings, or use manual port forwarding below.
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* Instance ports */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ports per instance</CardTitle>
              <p className="text-sm text-muted-foreground">
                Forward these in your router. Protocol: UDP for game, TCP for web.
              </p>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading instances...</p>
              ) : instancesWithPorts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No instances. Add or import a server first.</p>
              ) : (
                <div className="space-y-4">
                  {instancesWithPorts.map((inst) => (
                    <div
                      key={inst.name}
                      className="rounded-lg border border-border/60 p-4 space-y-3"
                    >
                      <h4 className="font-medium text-sm">{inst.name}</h4>
                      <div className="grid gap-2 sm:grid-cols-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Game (UDP):</span>
                          <Copyable text={String(inst.gamePort)}>
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono cursor-pointer hover:bg-muted/80">
                              {inst.gamePort}
                            </code>
                          </Copyable>
                          {isAllowed(inst.gamePort, "UDP") && (
                            <span className="text-[10px] text-emerald-500 font-medium">Allowed</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Nitrado web (TCP):</span>
                          <Copyable text={String(inst.webserverPort)}>
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono cursor-pointer hover:bg-muted/80">
                              {inst.webserverPort}
                            </code>
                          </Copyable>
                          {isAllowed(inst.webserverPort, "TCP") && (
                            <span className="text-[10px] text-emerald-500 font-medium">Allowed</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Firewall commands */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Windows Firewall commands
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={checkFirewall}
                  disabled={firewallChecking || instancesWithPorts.length === 0}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", firewallChecking && "animate-spin")} />
                  Check firewall
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Run PowerShell or Terminal <strong className="text-amber-500">as Administrator</strong>. Paste each command to allow the ports.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {instancesWithPorts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Add instances first to generate commands.</p>
              ) : (
                instancesWithPorts.map((inst) => {
                  const gameRule = `netsh advfirewall firewall add rule name="Hytale - ${inst.name} (Game)" dir=in action=allow protocol=UDP localport=${inst.gamePort}`;
                  const webRule = `netsh advfirewall firewall add rule name="Hytale - ${inst.name} (Web)" dir=in action=allow protocol=TCP localport=${inst.webserverPort}`;
                  return (
                    <div key={inst.name} className="space-y-2">
                      <h4 className="font-medium text-sm">{inst.name}</h4>
                      <div className="space-y-3">
                        <div>
                          <Copyable text={gameRule} className="block">
                            <pre className={cn(
                              "relative overflow-x-auto rounded-md bg-muted/80 px-3 py-2 pr-9 text-xs font-mono cursor-pointer hover:bg-muted",
                              isAllowed(inst.gamePort, "UDP") && "ring-1 ring-emerald-500/30"
                            )}>
                              {gameRule}
                              <Copy className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-60" />
                            </pre>
                          </Copyable>
                          {isAllowed(inst.gamePort, "UDP") && (
                            <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400/80">Already allowed</p>
                          )}
                        </div>
                        <div>
                          <Copyable text={webRule} className="block">
                            <pre className={cn(
                              "relative overflow-x-auto rounded-md bg-muted/80 px-3 py-2 pr-9 text-xs font-mono cursor-pointer hover:bg-muted",
                              isAllowed(inst.webserverPort, "TCP") && "ring-1 ring-emerald-500/30"
                            )}>
                              {webRule}
                              <Copy className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-60" />
                            </pre>
                          </Copyable>
                          {isAllowed(inst.webserverPort, "TCP") && (
                            <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400/80">Already allowed</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div className="pt-2 border-t border-border/60">
                <p className="text-xs text-muted-foreground mb-1">
                  Or copy all commands at once:
                </p>
                <Copyable
                  text={instancesWithPorts
                    .flatMap((inst) => [
                      `netsh advfirewall firewall add rule name="Hytale - ${inst.name} (Game)" dir=in action=allow protocol=UDP localport=${inst.gamePort}`,
                      `netsh advfirewall firewall add rule name="Hytale - ${inst.name} (Web)" dir=in action=allow protocol=TCP localport=${inst.webserverPort}`,
                    ])
                    .join("\n")}
                  className="block"
                >
                  <pre className="relative overflow-x-auto rounded-md bg-muted/80 px-3 py-2 pr-9 text-xs font-mono cursor-pointer hover:bg-muted">
                    {instancesWithPorts
                      .flatMap((inst) => [
                        `netsh advfirewall firewall add rule name="Hytale - ${inst.name} (Game)" dir=in action=allow protocol=UDP localport=${inst.gamePort}`,
                        `netsh advfirewall firewall add rule name="Hytale - ${inst.name} (Web)" dir=in action=allow protocol=TCP localport=${inst.webserverPort}`,
                      ])
                      .join("\n")}
                    <Copy className="absolute right-2 top-2 h-3.5 w-3.5 opacity-60" />
                  </pre>
                </Copyable>
              </div>
            </CardContent>
          </Card>

          {/* Router steps */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Router port forwarding (manual)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                <li>Find your local IP: run <code className="rounded bg-muted px-1">ipconfig</code> and note the IPv4 Address</li>
                <li>Open your router (often 192.168.1.1 or 10.0.0.1)</li>
                <li>Add a rule: Protocol UDP, Internal/External port = game port, Internal IP = your PC</li>
                <li>Add another rule: Protocol TCP, port = Nitrado web port (if you want remote web admin)</li>
                <li>Port only appears open when the server is running</li>
              </ol>
              <p className="text-muted-foreground">
                Hytale uses <strong className="text-foreground">UDP</strong> for player connections (QUIC), not TCP.
              </p>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
