/**
 * Console commands for server CLI.
 * Built-in commands live here. Custom commands are stored in app settings and merged at runtime.
 */

export interface ConsoleCommand {
  command: string;
  hint?: string;
  subCommands?: { command: string; hint?: string }[];
}

export interface FlatCommand {
  command: string;
  hint?: string;
}

/** Built-in commands – single source of truth. Easy to modify. */
export const CONSOLE_COMMANDS: ConsoleCommand[] = [
  { command: "/ban ", hint: "(username)" },
  { command: "/unban ", hint: "(username)" },
  { command: "/kick ", hint: "(username)" },
  {
    command: "/op",
    subCommands: [
      { command: "/op ", hint: "(username or self)" },
      { command: "/op add ", hint: "(username)" },
      { command: "/op remove ", hint: "(username)" },
    ],
  },
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
  { command: "/stop" },
];

/**
 * Merge built-in commands with custom commands from settings.
 * Custom commands are appended after built-in.
 */
export function getMergedCommands(customCommands: ConsoleCommand[] = []): ConsoleCommand[] {
  const custom = Array.isArray(customCommands) ? customCommands : [];
  return [...CONSOLE_COMMANDS, ...custom];
}

/**
 * Primary list: one entry per command. Commands with subCommands appear once;
 * clicking inserts the base command. Sub-commands appear in the hover panel.
 */
export function getMainCommandsList(customCommands: ConsoleCommand[] = []): ConsoleCommand[] {
  return getMergedCommands(customCommands);
}

/**
 * Flattened list for backwards compatibility (e.g. favorites check).
 * Includes all base commands + all sub-commands as separate entries.
 */
function flattenCommands(items: ConsoleCommand[]): FlatCommand[] {
  const out: FlatCommand[] = [];
  for (const item of items) {
    if (item.subCommands?.length) {
      out.push({ command: item.command + (item.command.endsWith(" ") ? "" : " "), hint: undefined });
      for (const sub of item.subCommands) {
        out.push({ command: sub.command, hint: sub.hint });
      }
    } else {
      out.push({ command: item.command, hint: item.hint });
    }
  }
  return out;
}

/** All commands flattened (for compatibility, e.g. isFavorite checks). */
export function getAllCommandsFlat(customCommands: ConsoleCommand[] = []): FlatCommand[] {
  return flattenCommands(getMergedCommands(customCommands));
}

/** Sorted flat list (legacy). */
export function getAllCommandsSorted(customCommands: ConsoleCommand[] = []): FlatCommand[] {
  return [...getAllCommandsFlat(customCommands)].sort((a, b) => a.command.localeCompare(b.command));
}
