/**
 * Format a date as relative time (e.g. "3h ago", "7d ago").
 */
export function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

/** Format seconds as uptime string (e.g. "2h 15m", "45m"). */
export function formatUptime(seconds: number | null): string {
  if (seconds == null || seconds < 0) return "—";
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const secs = s % 60;
  if (m < 60) return secs > 0 ? `${m}m ${secs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mins = m % 60;
  if (h < 24) return mins > 0 ? `${h}h ${mins}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hrs = h % 24;
  return hrs > 0 ? `${d}d ${hrs}h` : `${d}d`;
}

/** Return true if more than 7 days old. */
export function isStale(iso: string | null): boolean {
  if (!iso) return true;
  const date = new Date(iso);
  const now = new Date();
  const days = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
  return days > 7;
}
