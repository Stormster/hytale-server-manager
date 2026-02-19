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
  instance_server_settings?: Record<string, InstanceServerSettings>;
  instance_ports?: Record<string, { game?: number; webserver?: number }>;
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

export interface ServerStatus {
  installed: boolean;
  running: boolean;
  running_instance: string | null;
  running_instances: RunningInstanceInfo[];
  uptime_seconds: number | null;
  last_exit_time: string | null;
  last_exit_code: number | null;
  ram_mb: number | null;
  cpu_percent: number | null;
  players: number | null;
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
  update_available: boolean;
  can_switch_release: boolean;
  can_switch_prerelease: boolean;
}

// ---- Backups ----
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

// ---- Info ----
export interface AppInfo {
  manager_version: string;
  java_ok: boolean;
  java_version: string;
  has_downloader: boolean;
  github_repo: string;
  report_url: string;
  /** True if Pro plugin loaded (plugins/pro_plugin.whl or .pyz present) */
  pro_loaded?: boolean;
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
}

export interface SSEOutputEvent {
  line: string;
}

export interface SSEConsoleDoneEvent {
  code: number;
}
