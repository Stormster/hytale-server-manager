import { Heart } from "lucide-react";
import { useAppInfo } from "@/api/hooks/useInfo";

const linkClass =
  "inline-flex items-center gap-1 rounded px-1 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground";

export function AppFooter({
  onNavigateToExperimental,
}: {
  onNavigateToExperimental?: () => void;
}) {
  const { data: appInfo } = useAppInfo();
  const repo = appInfo?.github_repo ?? "Stormster/Hytale-Remote";
  const releaseUrl = `https://github.com/${repo}/releases`;
  const issuesUrl = `https://github.com/${repo}/issues`;
  const latestAddon = appInfo?.experimental_addon_latest_version;
  const addonUpdateAvailable = appInfo?.experimental_addon_update_available === true;
  const addonChecked = Boolean(appInfo?.experimental_addon_update_checked_at);
  const showAddonFooterStatus = addonChecked && !!latestAddon && onNavigateToExperimental;

  return (
    <footer className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/50 bg-background/50 px-4 py-3">
      <div className="flex items-center gap-1">
        <a
          href={releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Release notes"
          className={linkClass}
        >
          v{appInfo?.manager_version ?? "..."}
        </a>
        <span className="text-muted-foreground/50">|</span>
        <a
          href="https://www.patreon.com/c/stormster"
          target="_blank"
          rel="noopener noreferrer"
          title="Get access to experimental features"
          className={linkClass}
        >
          Made with <Heart className="h-3.5 w-3.5 fill-red-500 text-red-500" /> by Stormster
        </a>
        {showAddonFooterStatus && (
          <>
            <span className="text-muted-foreground/50">|</span>
            <button
              type="button"
              onClick={onNavigateToExperimental}
              className={
                addonUpdateAvailable
                  ? "inline-flex items-center rounded px-2 py-1 text-xs font-medium text-amber-400 hover:text-amber-300"
                  : "inline-flex items-center rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              }
              title="Open Experimental"
            >
              {addonUpdateAvailable
                ? `Experimental addon update: v${latestAddon}`
                : `Experimental addon up to date (v${latestAddon})`}
            </button>
          </>
        )}
      </div>
      <a
        href={issuesUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        Report Issues
      </a>
    </footer>
  );
}
