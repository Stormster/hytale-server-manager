import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Globe, Plug, Terminal } from "lucide-react";
import {
  useAddRemoteConnection,
  useRemoteCommand,
  useRemoteConnections,
  useTestRemoteInfo,
} from "@/api/hooks/useRemote";
import { toast } from "sonner";

export function RemoteView() {
  const { data, refetch } = useRemoteConnections();
  const addConn = useAddRemoteConnection();
  const testInfo = useTestRemoteInfo();
  const runCmd = useRemoteCommand();

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [command, setCommand] = useState("list");
  const [output, setOutput] = useState<string | null>(null);

  const connections = data?.connections ?? [];
  const selected =
    connections.find((c) => c.id === selectedId) ?? connections[0] ?? null;

  const handleAdd = () => {
    if (!name.trim() || !baseUrl.trim() || !apiKey.trim()) {
      toast.error("Name, server URL, and API key are required.");
      return;
    }
    addConn.mutate(
      { name: name.trim(), base_url: baseUrl.trim(), api_key: apiKey.trim() },
      {
        onSuccess: (conn) => {
          setName("");
          setBaseUrl("");
          setApiKey("");
          setSelectedId(conn.id);
        },
      }
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Remote server</h1>
        <p className="text-sm text-muted-foreground">
          Dev-only: manage hosted servers via the Hytale Remote plugin. Set HSM_ENABLE_REMOTE=1 to use.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plug className="h-4 w-4" />
            Saved connections
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No connections saved yet.</p>
          ) : (
            connections.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={selected?.id === c.id ? "default" : "outline"}
                onClick={() => setSelectedId(c.id)}
              >
                {c.name}
              </Button>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" />
            Add connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 max-w-lg">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My hosted server" />
          </div>
          <div className="space-y-1">
            <Label>Server URL</Label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://host:7003/Stormster/HytaleRemote"
            />
          </div>
          <div className="space-y-1">
            <Label>API key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="From plugin setup page or /pair"
            />
          </div>
          <Button onClick={handleAdd} disabled={addConn.isPending}>
            Save connection
          </Button>
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Terminal className="h-4 w-4" />
              Test: {selected.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              size="sm"
              disabled={testInfo.isPending}
              onClick={() => {
                testInfo.mutate(selected.id, {
                  onSuccess: (info) => toast.success(`Connected: ${JSON.stringify(info)}`),
                  onError: (e) => toast.error((e as Error).message),
                });
              }}
            >
              Test connection (/info)
            </Button>
            <div className="flex flex-wrap gap-2">
              <Input
                className="max-w-md font-mono text-sm"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
              />
              <Button
                disabled={runCmd.isPending}
                onClick={() => {
                  runCmd.mutate(
                    { connection_id: selected.id, command },
                    {
                      onSuccess: (res) => {
                        setOutput(res.output ?? res.error ?? JSON.stringify(res));
                        if (res.timed_out) toast.warning("Command timed out on server");
                      },
                      onError: (e) => toast.error((e as Error).message),
                    }
                  );
                }}
              >
                Run command
              </Button>
            </div>
            {output && (
              <pre className="max-h-48 overflow-auto rounded-md border bg-muted/30 p-3 text-xs font-mono">
                {output}
              </pre>
            )}
          </CardContent>
        </Card>
      )}

      <Button variant="ghost" size="sm" onClick={() => refetch()}>
        Refresh list
      </Button>
    </div>
  );
}
