/**
 * ANSI SGR (Select Graphic Rendition) color mapping.
 * Standard 16 colors + default for terminal output on dark backgrounds.
 */
const ANSI_COLORS: Record<number, string> = {
  // Normal
  30: "#6b7280", // black
  31: "#ef4444", // red
  32: "#22c55e", // green
  33: "#eab308", // yellow
  34: "#3b82f6", // blue
  35: "#d946ef", // magenta
  36: "#06b6d4", // cyan
  37: "#e5e7eb", // white
  39: "inherit", // default
  // Bright
  90: "#9ca3af",
  91: "#f87171",
  92: "#4ade80",
  93: "#facc15",
  94: "#60a5fa",
  95: "#e879f9",
  96: "#22d3ee",
  97: "#f9fafb",
};

export interface AnsiSegment {
  text: string;
  color?: string;
  bold?: boolean;
}

/**
 * Parse a string containing ANSI escape sequences into styled segments.
 * Strips unknown sequences and returns segments with color/bold styling.
 */
export function parseAnsi(line: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let color: string | undefined;
  let bold = false;
  let i = 0;

  while (i < line.length) {
    // Find next ESC (0x1b) or end
    const escIdx = line.indexOf("\x1b", i);
    if (escIdx === -1) {
      const text = line.slice(i);
      if (text) segments.push({ text, color, bold });
      break;
    }

    // Push text before ESC
    if (escIdx > i) {
      segments.push({ text: line.slice(i, escIdx), color, bold });
    }

    // Parse ESC sequence: ESC [ <params> <final byte>
    if (line[escIdx + 1] !== "[") {
      i = escIdx + 1;
      continue;
    }

    let j = escIdx + 2;
    const params: number[] = [];
    let param = "";

    while (j < line.length) {
      const c = line[j];
      if (c >= "0" && c <= "9") {
        param += c;
        j++;
      } else if (c === ";") {
        params.push(param ? parseInt(param, 10) : 0);
        param = "";
        j++;
      } else {
        if (param) params.push(parseInt(param, 10));
        break;
      }
    }

    const finalByte = line[j] ?? "";
    j++;

    if (finalByte === "m") {
      // SGR - apply to state
      for (let k = 0; k < params.length; k++) {
        const p = params[k];
        if (p === 0) {
          color = undefined;
          bold = false;
        } else if (p === 1) {
          bold = true;
        } else if (p === 22) {
          bold = false;
        } else if (p === 39) {
          color = undefined;
        } else if (ANSI_COLORS[p] !== undefined) {
          color = ANSI_COLORS[p];
        } else if (p === 38 && params[k + 1] === 5 && params[k + 2] !== undefined) {
          // 256-color: ESC[38;5;n
          color = xterm256Color(params[k + 2]);
          k += 2;
        }
        // Ignore other codes (48 background, etc.)
      }
    }
    // For other CSI sequences (2J, K, etc.) we just consume and don't change state

    i = j;
  }

  return segments;
}

/** Approximate xterm 256-color palette (simplified - first 16 map to standard) */
function xterm256Color(index: number): string {
  if (index < 16) return ANSI_COLORS[30 + (index % 8)] ?? "inherit";
  if (index >= 232) {
    const g = Math.round(((index - 232) / 24) * 255);
    return `rgb(${g},${g},${g})`;
  }
  const r = Math.floor(((index - 16) / 36) % 6) * 51;
  const g = Math.floor(((index - 16) / 6) % 6) * 51;
  const b = Math.floor((index - 16) % 6) * 51;
  return `rgb(${r},${g},${b})`;
}
