/**
 * Parse OAuth device-flow output from the Hytale downloader / server.
 * Extracts the auth URL and user code for display in the GUI.
 */
export interface ParsedAuthOutput {
  authUrl: string | null;
  baseUrl: string | null;
  code: string | null;
}

const URL_RE = /https:\/\/oauth\.accounts\.hytale\.com\/[^\s<>"{}|\\^`[\]]+/g;
const CODE_RE =
  /(?:Authorization code|user_code=)(?:\s*:\s*)?([a-z0-9]+(?:-[a-z0-9]+)?)/i;

function userCodeFromUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get("user_code");
  } catch {
    const m = url.match(/[?&]user_code=([a-z0-9-]+)/i);
    return m?.[1] ?? null;
  }
}

/**
 * Wrap a Hytale OAuth URL in the account login flow so that signing in returns
 * to the device page. Opening the verify URL directly while signed out drops
 * the user on /settings and orphans the code, because the identity provider
 * does not set return_to on its own. Non-Hytale URLs are passed through.
 */
export function buildSignInUrl(url: string): string {
  try {
    if (new URL(url).hostname !== "oauth.accounts.hytale.com") return url;
  } catch {
    return url;
  }
  return `https://accounts.hytale.com/login?return_to=${encodeURIComponent(url)}`;
}

/** Format an 8-char device code as XXXX-XXXX to match the Hytale authorize page. */
export function formatAuthCode(code: string): string {
  const clean = code.replace(/[^a-zA-Z0-9]/g, "");
  if (clean.length === 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  }
  return code;
}

export function parseAuthOutput(lines: string[]): ParsedAuthOutput {
  const text = lines.join("\n");
  const urls = text.match(URL_RE) ?? [];

  const authUrl = urls.find((u) => u.includes("user_code=")) ?? urls[0] ?? null;
  const baseUrl = urls.find((u) => !u.includes("user_code=")) ?? null;

  const codeFromUrl = authUrl ? userCodeFromUrl(authUrl) : null;
  const codeMatch = text.match(CODE_RE);
  const code = codeFromUrl ?? codeMatch?.[1] ?? null;

  return { authUrl, baseUrl, code };
}
