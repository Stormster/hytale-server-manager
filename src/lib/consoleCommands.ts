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

/** Built-in commands – single source of truth. A–Z. */
export const CONSOLE_COMMANDS: ConsoleCommand[] = [
  { command: "/backup" },
  { command: "/ban ", hint: "(username)" },
  { command: "/gamemode ", hint: "(gamemode)" },
  {
    command: "/hide",
    subCommands: [
      { command: "/hide ", hint: "(player)" },
      { command: "/hide all" },
      { command: "/hide show ", hint: "(player)" },
      { command: "/hide showall" },
    ],
  },
  { command: "/kick ", hint: "(player)" },
  { command: "/kill" },
  {
    command: "/op",
    subCommands: [
      { command: "/op add ", hint: "(player)" },
      { command: "/op remove ", hint: "(player)" },
      { command: "/op self" },
    ],
  },
  { command: "/refer ", hint: "(host) (port)" },
  { command: "/say ", hint: "(message)" },
  {
    command: "/spawning",
    subCommands: [
      { command: "/spawning beacons" },
      { command: "/spawning beacons add ", hint: "(beacon)" },
      { command: "/spawning beacons trigger" },
      { command: "/spawning disable" },
      { command: "/spawning enable" },
      { command: "/spawning markers" },
      { command: "/spawning markers add ", hint: "(marker)" },
      { command: "/spawning markers disable" },
      { command: "/spawning markers enable" },
      { command: "/spawning populate" },
      { command: "/spawning stats" },
      { command: "/spawning suppression" },
      { command: "/spawning suppression add ", hint: "(suppression)" },
      { command: "/spawning suppression dump" },
      { command: "/spawning suppression dumpall" },
    ],
  },
  { command: "/stop" },
  {
    command: "/time",
    subCommands: [
      { command: "/time set ", hint: "(time)" },
      { command: "/time set dawn" },
      { command: "/time set dusk" },
      { command: "/time set midday" },
      { command: "/time set midnight" },
    ],
  },
  {
    command: "/tp",
    subCommands: [
      { command: "/tp ", hint: "(player) (targetPlayer)" },
      { command: "/tp ", hint: "(player) (x) (y) (z)" },
      { command: "/tp ", hint: "(targetPlayer)" },
      { command: "/tp ", hint: "(x) (y) (z)" },
      { command: "/tp all ", hint: "(x) (y) (z)" },
      { command: "/tp world ", hint: "(worldName)" },
    ],
  },
  { command: "/unban ", hint: "(player)" },
  {
    command: "/warp",
    subCommands: [
      { command: "/warp ", hint: "(warpName)" },
      { command: "/warp go ", hint: "(warpName)" },
      { command: "/warp list" },
      { command: "/warp reload" },
      { command: "/warp remove ", hint: "(name)" },
      { command: "/warp set ", hint: "(name)" },
    ],
  },
  {
    command: "/weather",
    subCommands: [
      { command: "/weather get" },
      { command: "/weather reset" },
      { command: "/weather set ", hint: "(weather)" },
    ],
  },
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
