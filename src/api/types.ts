// ---- Settings ----
export interface InstanceServerSettings {
  ram_min_gb?: number | null;
  ram_max_gb?: number | null;
  startup_args?: string[];
}

export interface AppSettings {
  root_dir: string;
  active_instance: string;
  default_root_dir?: string;
  onboarding_completed?: boolean;
  instance_server_settings?: Record<string, InstanceServerSettings>;
  instance_ports?: Record<string, { game?: number; webserver?: number }>;
  /** License key for Experimental addon (Patreon). */
  experimental_addon_license_key?: string;
}

// ---- Instances ----
export interface Instance {
  name: string;
  installed: boolean;
  version: string;
  patchline: string;
  game_port?: number;
  webserver_port?: number;
  last_backup_created?: string | null;
}

// ---- Server ----
export interface RunningInstanceInfo {
  name: string;
  game_port: number | null;
  uptime_seconds: number | null;
  ram_mb: number | null;
  cpu_percent: number | null;
}

export interface InstanceExitInfo {
  exit_time: string;
  exit_code: number;
}

export interface ServerStatus {
  installed: boolean;
  running: boolean;
  running_instance: string | null;
  running_instances: RunningInstanceInfo[];
  uptime_seconds: number | null;
  last_exit_time: string | null;
  last_exit_code: number | null;
  /** Per-instance last exit info keyed by instance name */
  last_exits?: Record<string, InstanceExitInfo>;
  ram_mb: number | null;
  cpu_percent: number | null;
  players: number | null;
  /** Instance name being updated, or null if no update in progress */
  update_in_progress: string | null;
}

// ---- Mods ----
export interface Mod {
  name: string;
  /** Human-readable title from manifest.json (Group Name Version), fallback to filename */
  displayName?: string;
  /** Plugin data folder (Group_Name convention), e.g. Nitrado_WebServer */
  dataFolder?: string;
  /** Whether the data folder exists on disk (plugin has created it) */
  dataFolderExists?: boolean;
  /** "plugin" | "pack" | "plugin_pack" - detected from manifest Main + IncludesAssetPack */
  modType?: "plugin" | "pack" | "plugin_pack";
  path: string;
  enabled: boolean;
  required: boolean;
}

// ---- Updater ----
export interface UpdaterLocalStatus {
  installed_version: string;
  installed_patchline: string;
}

export interface UpdaterFullStatus {
  installed_version: string;
  installed_patchline: string;
  remote_release: string | null;
  remote_prerelease: string | null;
  remote_error?: string | null;
  remote_error_kind?: string | null;
  update_available: boolean;
  can_switch_release: boolean;
  can_switch_prerelease: boolean;
  switch_to_release_is_downgrade: boolean;
  switch_to_prerelease_is_downgrade: boolean;
}

// ---- Backups ----
/** Hytale world/universe snapshot (from --backup or /backup). Stored in Server/backups/. */
export interface HytaleWorldBackup {
  filename: string;
  path: string;
  created: string | null;
  size_bytes: number;
  archived: boolean;
}

export interface Backup {
  folder_name: string;
  backup_type: "manual" | "pre-update";
  label: string;
  display_title: string;
  display_detail: string;
  from_version: string | null;
  from_patchline: string | null;
  to_version: string | null;
  to_patchline: string | null;
  created: string | null;
  has_server: boolean;
}

// ---- Config Files ----
export interface ConfigFileContent {
  content: string;
}

export interface WorldsList {
  worlds: string[];
}

export interface LatestLog {
  filename: string;
  content: string;
}

// ---- Auth ----
export interface AuthStatus {
  has_credentials: boolean;
}

export interface AuthHealth {
  has_credentials: boolean;
  auth_valid: boolean;
  auth_expired: boolean;
  error_kind: string | null;
  error: string | null;
}

// ---- Info ----
export interface AppInfo {
  manager_version: string;
  java_ok: boolean;
  java_version: string;
  has_downloader: boolean;
  github_repo: string;
  report_url: string;
  /** True if Experimental addon loaded (addons/experimental_addon.whl or .pyz present) */
  experimental_addon_loaded?: boolean;
  /** True if addon file is present on disk (whl/pyz), even if not loaded yet. */
  experimental_addon_installed?: boolean;
  /** Version parsed from installed wheel/pyz METADATA, if known. */
  experimental_addon_installed_version?: string | null;
  /** Feature IDs reported by addon when license is valid (e.g. ["json_checker"]) */
  experimental_addon_features?: string[];
  /** Per-feature overrides: feature_id -> false = off. Unset = on by default. */
  experimental_addon_feature_flags?: Record<string, boolean>;
  /** Platform from backend: win32, linux, darwin, etc. */
  platform?: string;
  /** Unix timestamp (seconds) when addon update snapshot was checked. */
  experimental_addon_update_checked_at?: number;
  /** Latest addon version from update service, if known. */
  experimental_addon_latest_version?: string | null;
  /** Version reported by last update check (usually matches installed when up to date). */
  experimental_addon_current_version?: string | null;
  /** Whether addon update is available for the saved license key. */
  experimental_addon_update_available?: boolean;
  /** Additional reason (already_latest, no_compatible_release, no_license_key, etc). */
  experimental_addon_update_reason?: string | null;
  /** Optional check error from update service (for diagnostics). */
  experimental_addon_update_error?: string | null;
}

export interface ManagerUpdateInfo {
  update_available: boolean;
  latest_version: string;
  download_url: string;
}

// ---- SSE Events ----
export interface SSEStatusEvent {
  message: string;
}

export interface SSEProgressEvent {
  percent: number;
  detail: string;
}

export interface SSEDoneEvent {
  ok: boolean;
  message: string;
  code?: string;
  can_skip_backup?: boolean;
}

export interface SSEOutputEvent {
  line: string;
}

export interface SSEConsoleDoneEvent {
  code: number;
}
