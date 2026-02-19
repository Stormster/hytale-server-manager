export interface ConsoleCommand {
  command: string;
  hint?: string;
  subCommands?: { command: string; hint?: string }[];
}

export interface FlatCommand {
  command: string;
  hint?: string;
}

export const CONSOLE_COMMANDS: ConsoleCommand[] = [
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

function flattenCommands(items: ConsoleCommand[]): FlatCommand[] {
  const out: FlatCommand[] = [];
  for (const item of items) {
    if (item.subCommands) {
      out.push({ command: item.command + " ", hint: undefined });
      for (const sub of item.subCommands) {
        out.push({ command: sub.command, hint: sub.hint });
      }
    } else {
      out.push({ command: item.command, hint: item.hint });
    }
  }
  return out;
}

const ALL_FLAT = flattenCommands(CONSOLE_COMMANDS);

export function getAllCommandsSorted(): FlatCommand[] {
  return [...ALL_FLAT].sort((a, b) => a.command.localeCompare(b.command));
}
