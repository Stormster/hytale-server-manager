import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/api/client";

const URL_RE = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
const SCROLL_AT_BOTTOM_THRESHOLD = 80;

function parseLineWithLinks(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const re = new RegExp(URL_RE.source, "g");
  while ((match = re.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    const url = match[1];
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="text-blue-400 hover:underline break-all"
        onClick={(e) => {
          e.preventDefault();
          import("@tauri-apps/plugin-opener")
            .then(({ openUrl }) => openUrl(url))
            .catch(() =>
              import("@tauri-apps/plugin-shell")
                .then(({ open }) => open(url))
                .catch(() => window.open(url, "_blank"))
            );
        }}
      >
        {url}
      </a>
    );
    lastIndex = re.lastIndex;
  }
  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }
  return parts.length ? parts : [line];
}

interface ServerConsoleProps {
  lines: string[];
  running: boolean;
  className?: string;
}

export function ServerConsole({
  lines,
  running,
  className,
}: ServerConsoleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [command, setCommand] = useState("");
  const [sending, setSending] = useState(false);
  const userScrolledUpRef = useRef(false);
  const programmaticScrollRef = useRef(false);

  const checkAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    const { scrollTop, scrollHeight, clientHeight } = el;
    return scrollHeight - scrollTop - clientHeight < SCROLL_AT_BOTTOM_THRESHOLD;
  }, []);

  useEffect(() => {
    if (lines.length === 0) return;
    if (!userScrolledUpRef.current || checkAtBottom()) {
      programmaticScrollRef.current = true;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      userScrolledUpRef.current = false;
      const id = setTimeout(() => {
        programmaticScrollRef.current = false;
      }, 400);
      return () => clearTimeout(id);
    }
  }, [lines.length, checkAtBottom]);

  const handleScroll = useCallback(() => {
    if (programmaticScrollRef.current) return;
    userScrolledUpRef.current = !checkAtBottom();
  }, [checkAtBottom]);

  const sendCommand = useCallback(async () => {
    const cmd = command.trim();
    if (!cmd || !running || sending) return;

    setSending(true);
    setCommand("");
    try {
      await api("/api/server/command", {
        method: "POST",
        body: JSON.stringify({ command: cmd + "\n" }),
      });
    } catch {
      // Ignore - server might not support stdin
    } finally {
      setSending(false);
    }
  }, [command, running, sending]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendCommand();
    }
  };

  return (
    <div className={cn("flex flex-col rounded-lg border bg-zinc-950", className)}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden font-mono text-sm rounded-[inherit] [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-track]:transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
      >
        <div className="p-4 min-h-[200px] select-text">
          {lines.length === 0 ? (
            <span className="text-muted-foreground">No output yet...</span>
          ) : (
            lines.map((line, i) => (
              <div
                key={i}
                className="text-zinc-300 leading-relaxed whitespace-pre-wrap break-words"
              >
                {parseLineWithLinks(line)}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      {running && (
        <div className="flex gap-2 p-2 border-t border-white/10">
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 rounded-md border border-white/20 bg-zinc-900 px-3 py-2 font-mono text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={sending}
          />
          <button
            onClick={sendCommand}
            disabled={!command.trim() || sending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
