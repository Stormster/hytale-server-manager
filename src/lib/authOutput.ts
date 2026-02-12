/**
 * Parse OAuth device-flow output from the Hytale downloader.
 * Extracts the auth URL and user code for display in the GUI.
 */
export interface ParsedAuthOutput {
  authUrl: string | null;
  baseUrl: string | null;
  code: string | null;
}

const URL_RE = /https:\/\/oauth\.accounts\.hytale\.com\/[^\s]+/g;
const CODE_RE = /(?:Authorization code|user_code=)(?:\s*:\s*)?([a-z0-9]+)/i;

export function parseAuthOutput(lines: string[]): ParsedAuthOutput {
  const text = lines.join("\n");
  const urls = text.match(URL_RE) ?? [];
  const codeMatch = text.match(CODE_RE);

  const authUrl = urls.find((u) => u.includes("user_code=")) ?? urls[0] ?? null;
  const baseUrl = urls.find((u) => !u.includes("user_code=")) ?? null;
  const code = codeMatch?.[1] ?? null;

  return { authUrl, baseUrl, code };
}
