import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { List, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/api/client";
import { parseAnsi } from "@/lib/ansiParser";

interface ConsoleCommand {
  command: string;
  hint?: string;
  subCommands?: { command: string; hint?: string }[];
}

const CONSOLE_COMMANDS: ConsoleCommand[] = [
  { command: "/ban ", hint: "(username)" },
  { command: "/unban ", hint: "(username)" },
  { command: "/kick ", hint: "(username)" },
  { command: "/op ", hint: "(username)" },
  { command: "/deop ", hint: "(username)" },
  {
    command: "/whitelist",
    subCommands: [
      { command: "/whitelist add ", hint: "(username)" },
      { command: "/whitelist remove ", hint: "(username)" },
      { command: "/whitelist enable" },
      { command: "/whitelist disable" },
      { command: "/whitelist list" },
    ],
  },
  { command: "/mute ", hint: "(username)" },
  { command: "/unmute ", hint: "(username)" },
  { command: "/save" },
  { command: "/stop" },
];

const URL_RE = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
const SCROLL_AT_BOTTOM_THRESHOLD = 120;

function parseLineWithLinks(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const re = new RegExp(URL_RE.source, "g");
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
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
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length ? parts : [text];
}

function parseLine(line: string): React.ReactNode[] {
  const segments = parseAnsi(line);
  const out: React.ReactNode[] = [];
  let key = 0;
  for (const { text, color, bold } of segments) {
    if (!text) continue;
    const style: React.CSSProperties = {};
    if (color) style.color = color;
    if (bold) style.fontWeight = "bold";
    const content = parseLineWithLinks(text);
    out.push(
      <span key={key++} style={Object.keys(style).length ? style : undefined}>
        {content}
      </span>
    );
  }
  return out.length ? out : [line];
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
  const measureRef = useRef<HTMLSpanElement>(null);
  const commandsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [command, setCommand] = useState("");
  const [helperText, setHelperText] = useState<string | null>(null);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [hoveredParent, setHoveredParent] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const userScrolledUpRef = useRef(false);
  const programmaticScrollRef = useRef(false);

  const checkAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    const { scrollTop, scrollHeight, clientHeight } = el;
    return scrollHeight - scrollTop - clientHeight < SCROLL_AT_BOTTOM_THRESHOLD;
  }, []);

  // useLayoutEffect + direct scrollTop so we keep up with rapid log output during startup
  useLayoutEffect(() => {
    if (lines.length === 0) return;
    if (!userScrolledUpRef.current || checkAtBottom()) {
      programmaticScrollRef.current = true;
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight - el.clientHeight;
      userScrolledUpRef.current = false;
      const id = setTimeout(() => {
        programmaticScrollRef.current = false;
      }, 100);
      return () => clearTimeout(id);
    }
  }, [lines.length, checkAtBottom]);

  const handleScroll = useCallback(() => {
    if (programmaticScrollRef.current) return;
    userScrolledUpRef.current = !checkAtBottom();
  }, [checkAtBottom]);

  const insertCommand = useCallback((cmd: string, hint?: string) => {
    setCommand(cmd);
    setHelperText(hint ?? null);
    setCommandsOpen(false);
    setHoveredParent(null);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (input) {
        input.focus();
        input.setSelectionRange(cmd.length, cmd.length);
      }
    });
  }, []);

  const handleCommandChange = useCallback((value: string) => {
    setCommand(value);
    setHelperText(null); // Clear helper as soon as user types
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (commandsRef.current && !commandsRef.current.contains(e.target as Node)) {
        setCommandsOpen(false);
        setHoveredParent(null);
      }
    }
    if (commandsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [commandsOpen]);

  const sendCommand = useCallback(async () => {
    const cmd = command.trim();
    if (!cmd || !running || sending) return;

    setSending(true);
    setCommand("");
    setHelperText(null);
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
                {parseLine(line)}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="flex gap-2 p-2 border-t border-white/10">
        <div ref={commandsRef} className="relative flex min-w-0 shrink-0">
          <div className="relative flex items-center">
            <button
              type="button"
              onClick={() => setCommandsOpen(!commandsOpen)}
              className={cn(
                "rounded-md border border-white/20 bg-zinc-900 px-3 py-2 font-mono text-sm flex items-center gap-1.5 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50",
                commandsOpen && "bg-zinc-800"
              )}
              disabled={sending || !running}
              title="View commands"
              >
                <List className="h-3.5 w-3.5" />
                Commands
                <ChevronDown
                  className={cn("h-3 w-3 transition-transform", commandsOpen && "rotate-180")}
                />
              </button>
              {commandsOpen && (
                <div
                  className="absolute left-0 bottom-full mb-1 flex rounded-md border border-white/20 bg-zinc-900 shadow-lg z-50"
                  onMouseLeave={() => setHoveredParent(null)}
                >
                  <div className="w-48 max-h-64 overflow-y-auto py-1 border-r border-white/10">
                    <div className="px-2 py-1.5 text-xs text-zinc-500 uppercase tracking-wider">
                      Commands
                    </div>
                    {CONSOLE_COMMANDS.map((item) =>
                      item.subCommands ? (
                        <div
                          key={item.command}
                          className={cn(
                            "flex items-center justify-between gap-2 px-3 py-1.5 font-mono text-sm cursor-pointer",
                            hoveredParent === item.command ? "bg-zinc-800" : "hover:bg-zinc-800"
                          )}
                          onMouseEnter={() => setHoveredParent(item.command)}
                          onClick={() => insertCommand(item.command + " ")}
                        >
                          <span>{item.command}</span>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                        </div>
                      ) : (
                        <button
                          key={item.command}
                          type="button"
                          className="w-full px-3 py-1.5 text-left font-mono text-sm hover:bg-zinc-800"
                          onClick={() => insertCommand(item.command, item.hint)}
                        >
                          {item.command.trim()}
                          {item.hint && <span className="text-zinc-500 ml-1">{item.hint}</span>}
                        </button>
                      )
                    )}
                  </div>
                  {hoveredParent && (
                    <div className="w-56 max-h-64 overflow-y-auto py-1">
                      <div className="px-2 py-1.5 text-xs text-zinc-500 uppercase tracking-wider">
                        Sub-commands
                      </div>
                      {CONSOLE_COMMANDS.find((c) => c.command === hoveredParent)?.subCommands?.map(
                        ({ command: cmd, hint }) => (
                          <button
                            key={cmd}
                            type="button"
                            className="w-full px-3 py-1.5 text-left font-mono text-sm hover:bg-zinc-800"
                            onClick={() => insertCommand(cmd, hint)}
                          >
                            {cmd.trim()}
                            {hint && <span className="text-zinc-500 ml-1">{hint}</span>}
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="relative flex-1 flex min-w-0">
            <div className="relative flex-1 flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={command}
                onChange={(e) => handleCommandChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={!helperText ? "Type a command..." : undefined}
                className="flex-1 min-w-0 rounded-md border border-white/20 bg-zinc-900 px-3 py-2 font-mono text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={sending || !running}
              />
              {helperText && (
                <div
                  className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none select-none font-mono text-sm"
                  aria-hidden
                >
                  <span ref={measureRef} className="invisible whitespace-pre">
                    {command}
                  </span>
                  <span className="text-zinc-500">{helperText}</span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={sendCommand}
            disabled={!command.trim() || sending || !running}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            Send
          </button>
        </div>
    </div>
  );
}
