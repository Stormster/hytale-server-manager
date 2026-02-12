import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface LogConsoleProps {
  lines: string[];
  className?: string;
}

export function LogConsole({ lines, className }: LogConsoleProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  return (
    <ScrollArea
      className={cn(
        "rounded-lg border bg-zinc-950 font-mono text-sm",
        className
      )}
    >
      <div className="p-4 min-h-[200px]">
        {lines.length === 0 ? (
          <span className="text-muted-foreground">No output yet...</span>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
