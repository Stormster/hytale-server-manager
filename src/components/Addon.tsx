import { useEffect, useRef, useState } from "react";
import { fetchRaw, getBaseUrl, getAuthHeaders } from "@/api/client";
import type { ConsoleCommand } from "@/lib/consoleCommands";

type JsonEditorHandle = {
  update(value: string): void;
  destroy(): void;
};

type SettingsHandle = {
  destroy(): void;
};

type AddonComponents = {
  json_checker?: {
    create(
      container: HTMLElement,
      options: { value: string; onChange: (v: string) => void }
    ): JsonEditorHandle;
  };
  custom_commands?: {
    createSettings(container: HTMLElement): SettingsHandle;
    getCommands: () => Promise<ConsoleCommand[]> | ConsoleCommand[];
  };
};

const JSON_EDITOR_SCRIPT = "/api/addon/experimental/frontend/json-checker.js";
const CUSTOM_COMMANDS_SCRIPT = "/api/addon/experimental/frontend/custom-commands.js";
const loadCache = new Map<string, Promise<void>>();

function getComponents(): AddonComponents | undefined {
  return (window as any).__HSM_ADDON_COMPONENTS as AddonComponents | undefined;
}

async function runScript(js: string): Promise<void> {
  const blob = new Blob([js], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Addon script execution failed"));
      document.head.appendChild(script);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function ensureAddonFeature(
  scriptPath: string,
  isReady: () => boolean
): Promise<void> {
  if (isReady()) return;
  const existing = loadCache.get(scriptPath);
  if (existing) return existing;

  const pending = (async () => {
    const resp = await fetchRaw(scriptPath);
    if (!resp.ok) throw new Error(`Failed to load addon script: ${resp.status}`);
    const text = await resp.text();
    if (text.trimStart().startsWith("<"))
      throw new Error("Addon script URL returned HTML (wrong server or 404). Check backend is running and addon .whl includes frontend assets.");
    await runScript(text);
  })();

  pending.catch(() => loadCache.delete(scriptPath));
  loadCache.set(scriptPath, pending);
  return pending;
}

export function AddonJsonEditor({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<JsonEditorHandle | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureAddonFeature(
      JSON_EDITOR_SCRIPT,
      () => Boolean(getComponents()?.json_checker)
    )
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current) return;
    const feature = getComponents()?.json_checker;
    if (!feature) return;
    editorRef.current = feature.create(containerRef.current, {
      value,
      onChange: (v: string) => onChangeRef.current(v),
    });
    return () => {
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [ready]);

  useEffect(() => {
    editorRef.current?.update(value);
  }, [value]);

  return <div ref={containerRef} className={className} style={{ minHeight: 200 }} />;
}

/** Set globals so addon scripts can call the backend (they run in page origin, backend is another port). */
async function ensureAddonApiGlobals(): Promise<void> {
  if ((window as any).__HSM_API_BASE) return;
  (window as any).__HSM_API_BASE = await getBaseUrl();
  (window as any).__HSM_AUTH_HEADERS = await getAuthHeaders();
}

export function AddonCustomCommandsManager() {
  const containerRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<SettingsHandle | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureAddonApiGlobals()
      .then(() =>
        ensureAddonFeature(
          CUSTOM_COMMANDS_SCRIPT,
          () => Boolean(getComponents()?.custom_commands)
        )
      )
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current) return;
    const feature = getComponents()?.custom_commands;
    if (!feature) return;
    settingsRef.current = feature.createSettings(containerRef.current);
    return () => {
      settingsRef.current?.destroy();
      settingsRef.current = null;
    };
  }, [ready]);

  return <div ref={containerRef} />;
}

export async function fetchAddonCustomCommands(): Promise<ConsoleCommand[]> {
  try {
    await ensureAddonApiGlobals();
    await ensureAddonFeature(
      CUSTOM_COMMANDS_SCRIPT,
      () => Boolean(getComponents()?.custom_commands)
    );
    const result = await getComponents()?.custom_commands?.getCommands?.();
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}
