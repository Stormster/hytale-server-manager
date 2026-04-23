use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;

/// Shared state holding the backend port and auth token once the backend reports ready.
/// Port uses std::sync::Mutex so both the async runtime and dev-mode thread can set/read it.
struct BackendState {
    port: Arc<std::sync::Mutex<Option<u16>>>,
    /// Token required for API requests; only set when backend is started by Tauri.
    auth_token: Mutex<Option<String>>,
}

/// In dev (debug build): holds the Python process so we can kill it on exit.
struct DevBackendChild {
    child: std::sync::Mutex<Option<std::process::Child>>,
}

/// Inner state so we can replace the child when restarting the backend.
#[cfg(windows)]
struct BackendChildInner {
    child: Option<CommandChild>,
    job: Option<job::JobGuard>,
}
#[cfg(not(windows))]
struct BackendChildInner {
    child: Option<CommandChild>,
}

/// Holds the backend sidecar process so we can kill it when the app exits.
/// On Windows a Job Object with `KILL_ON_JOB_CLOSE` is used. Inner is in a
/// Mutex so we can replace the process when we auto-restart after a crash.
struct BackendChild {
    inner: std::sync::Mutex<BackendChildInner>,
}

impl BackendChild {
    #[cfg(windows)]
    fn replace(&self, child: CommandChild, job: Option<job::JobGuard>) {
        if let Ok(mut guard) = self.inner.lock() {
            let _ = guard.child.take();
            guard.job = job;
            guard.child = Some(child);
        }
    }
    #[cfg(not(windows))]
    fn replace(&self, child: CommandChild) {
        if let Ok(mut guard) = self.inner.lock() {
            let _ = guard.child.take();
            guard.child = Some(child);
        }
    }
}

impl Drop for BackendChild {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.inner.lock() {
            if let Some(child) = guard.child.take() {
                let _ = child.kill();
            }
            #[cfg(windows)]
            {
                guard.job = None;
            }
        }
    }
}

/// Kill the backend (sidecar or dev Python process) if it's still running. Safe to call multiple times.
fn kill_backend_child<R: tauri::Runtime>(app: &impl tauri::Manager<R>) {
    if let Some(backend) = app.try_state::<BackendChild>() {
        if let Ok(mut guard) = backend.inner.lock() {
            if let Some(child) = guard.child.take() {
                let _ = child.kill();
            }
            #[cfg(windows)]
            {
                guard.job = None;
            }
        }
    }
    if let Some(dev) = app.try_state::<DevBackendChild>() {
        if let Ok(mut guard) = dev.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Windows: Job Object so the backend dies with the parent no matter what
// ---------------------------------------------------------------------------
#[cfg(windows)]
mod job {
    use std::mem;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
    };

    /// RAII guard — closing the last handle to the job kills every process in it
    /// (thanks to the `KILL_ON_JOB_CLOSE` flag).
    pub struct JobGuard(HANDLE);

    unsafe impl Send for JobGuard {}
    unsafe impl Sync for JobGuard {}

    impl Drop for JobGuard {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }

    /// Create a Job Object with `KILL_ON_JOB_CLOSE` and assign `pid` to it.
    /// Returns `None` on failure (non-fatal — the event-based cleanup still
    /// covers graceful exits).
    pub fn assign_to_kill_on_close_job(pid: u32) -> Option<JobGuard> {
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return None;
            }

            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

            if SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                (&info as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            ) == 0
            {
                CloseHandle(job);
                return None;
            }

            let process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
            if process.is_null() {
                CloseHandle(job);
                return None;
            }

            let assigned = AssignProcessToJobObject(job, process);
            CloseHandle(process);
            if assigned == 0 {
                CloseHandle(job);
                return None;
            }

            Some(JobGuard(job))
        }
    }
}

/// Tauri command: return the backend port (or 0 if not ready yet).
#[tauri::command]
async fn get_backend_port(state: tauri::State<'_, Arc<BackendState>>) -> Result<u16, String> {
    state
        .port
        .lock()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Backend not ready yet".into())
}

/// Tauri command: return the backend auth token (for API requests). Empty when not running under Tauri or auth disabled.
#[tauri::command]
async fn get_backend_auth_token(state: tauri::State<'_, Arc<BackendState>>) -> Result<Option<String>, String> {
    let lock = state.auth_token.lock().await;
    Ok(lock.clone())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let auth_token: String = {
                use rand::Rng;
                let mut bytes = [0u8; 32];
                rand::thread_rng().fill(&mut bytes);
                bytes.iter().map(|b| format!("{:02x}", b)).collect()
            };
            let port = Arc::new(std::sync::Mutex::new(None));
            let state = Arc::new(BackendState {
                port: port.clone(),
                auth_token: Mutex::new(Some(auth_token.clone())),
            });
            app.manage(state.clone());

            if cfg!(debug_assertions) {
                // Dev mode: run backend from Python source so we see output and avoid frozen-exe issues
                // Exe is at repo/src-tauri/target/debug/app.exe -> go up to repo and join backend
                let backend_dir = match std::env::current_exe()
                    .ok()
                    .and_then(|p| p.parent().map(|q| q.to_path_buf()))
                    .and_then(|p| p.parent().map(|q| q.to_path_buf()))
                    .and_then(|p| p.parent().map(|q| q.to_path_buf()))
                    .and_then(|p| p.parent().map(|q| q.to_path_buf()))
                    .map(|p| p.join("backend"))
                {
                    Some(d) if d.is_dir() => d,
                    _ => {
                        eprintln!("[Tauri] Dev backend: could not find backend dir next to exe");
                        return Ok(());
                    }
                };
                let dev_child = Arc::new(DevBackendChild {
                    child: std::sync::Mutex::new(None),
                });
                app.manage(dev_child.clone());
                let auth = auth_token.clone();
                std::thread::spawn(move || {
                    use std::io::{BufRead, BufReader};
                    use std::process::{Command, Stdio};
                    loop {
                        *port.lock().unwrap() = None;
                        let mut cmd = Command::new(if cfg!(windows) { "py" } else { "python3" });
                        cmd.current_dir(&backend_dir)
                            .stdout(Stdio::piped())
                            .stderr(Stdio::inherit());
                        // Forward dev env (e.g. HSM_DEV_ADDON from `tauri:dev:addons`); `tauri dev` via cmd/npx
                        // must not drop these before they reach the Python child.
                        for (key, val) in std::env::vars() {
                            if key.starts_with("HSM_")
                                || (key.starts_with("HYTALE_") && key != "HYTALE_BACKEND_TOKEN")
                            {
                                cmd.env(key, val);
                            }
                        }
                        cmd.env("HYTALE_BACKEND_TOKEN", &auth);
                        if cfg!(windows) {
                            cmd.args(["-3", "main.py"]);
                        } else {
                            cmd.arg("main.py");
                        }
                        let mut child = match cmd.spawn() {
                            Ok(c) => c,
                            Err(e) => {
                                eprintln!("[Tauri] Dev backend spawn failed: {e}");
                                std::thread::sleep(std::time::Duration::from_secs(2));
                                continue;
                            }
                        };
                        let stdout = child.stdout.take();
                        *dev_child.child.lock().unwrap() = Some(child);
                        if let Some(stdout) = stdout {
                            let reader = BufReader::new(stdout);
                            for line in reader.lines().filter_map(Result::ok) {
                                if let Some(port_str) = line.trim().strip_prefix("BACKEND_READY:") {
                                    if let Ok(port_num) = port_str.parse::<u16>() {
                                        *port.lock().unwrap() = Some(port_num);
                                        println!("[Tauri] Backend ready on port {port_num}");
                                        break;
                                    }
                                }
                            }
                        }
                        let child = dev_child.child.lock().unwrap().take();
                        if let Some(mut c) = child {
                            let _ = c.wait();
                        }
                        eprintln!("[Tauri] Backend process exited; restarting...");
                        std::thread::sleep(std::time::Duration::from_millis(500));
                    }
                });
                return Ok(());
            }

            // Release: spawn the bundled sidecar backend (restarted automatically if it exits)
            let shell = app.shell();
            let sidecar = match shell.sidecar("server-manager-backend") {
                Ok(s) => s.env("HYTALE_BACKEND_TOKEN", &auth_token),
                Err(e) => {
                    eprintln!("[Tauri] Failed to create sidecar command: {e}");
                    return Ok(());
                }
            };

            let (first_rx, child) = match sidecar.spawn() {
                Ok(pair) => pair,
                Err(e) => {
                    eprintln!("[Tauri] Failed to spawn backend: {e}");
                    return Ok(());
                }
            };

            #[cfg(windows)]
            let job_guard = {
                let guard = job::assign_to_kill_on_close_job(child.pid());
                if guard.is_none() {
                    eprintln!(
                        "[Tauri] Warning: could not create kill-on-close job object for backend"
                    );
                }
                guard
            };

            #[cfg(windows)]
            let inner = BackendChildInner {
                child: Some(child),
                job: job_guard,
            };
            #[cfg(not(windows))]
            let inner = BackendChildInner {
                child: Some(child),
            };

            app.manage(BackendChild {
                inner: std::sync::Mutex::new(inner),
            });

            let state_clone = state.clone();
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent;
                let mut rx = first_rx;
                loop {
                    let mut saw_terminated = false;
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line_bytes) => {
                                let line = String::from_utf8_lossy(&line_bytes);
                                if let Some(port_str) = line.trim().strip_prefix("BACKEND_READY:") {
                                    if let Ok(port_num) = port_str.parse::<u16>() {
                                        *state_clone.port.lock().unwrap() = Some(port_num);
                                        println!("[Tauri] Backend ready on port {port_num}");
                                    }
                                }
                            }
                            CommandEvent::Terminated(_) => {
                                saw_terminated = true;
                                break;
                            }
                            _ => {}
                        }
                    }
                    if !saw_terminated {
                        // Stream ended without explicit process termination. Keep current port/state.
                        // This avoids false "backend exited" restarts that can cause frontend disconnects.
                        eprintln!(
                            "[Tauri] Backend event stream ended without termination event; not restarting."
                        );
                        break;
                    }
                    // Backend process exited (crash or normal) – clear port and restart
                    *state_clone.port.lock().unwrap() = None;
                    eprintln!("[Tauri] Backend process exited; restarting...");
                    let shell = app_handle.shell();
                    let token = state_clone.auth_token.lock().await.clone();
                    let mut sidecar = match shell.sidecar("server-manager-backend") {
                        Ok(s) => s,
                        Err(e) => {
                            eprintln!("[Tauri] Failed to create sidecar: {e}");
                            break;
                        }
                    };
                    if let Some(t) = &token {
                        sidecar = sidecar.env("HYTALE_BACKEND_TOKEN", t);
                    }
                    let (new_rx, new_child) = match sidecar.spawn() {
                        Ok(pair) => pair,
                        Err(e) => {
                            eprintln!("[Tauri] Failed to spawn backend: {e}");
                            break;
                        }
                    };
                    #[cfg(windows)]
                    let new_job = job::assign_to_kill_on_close_job(new_child.pid());
                    if let Some(backend) = app_handle.try_state::<BackendChild>() {
                        #[cfg(windows)]
                        backend.replace(new_child, new_job);
                        #[cfg(not(windows))]
                        backend.replace(new_child);
                    }
                    rx = new_rx;
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_backend_port, get_backend_auth_token])
        // Backend is killed gracefully in ExitRequested, and again in Exit as a
        // safety net. The Job Object (Windows) handles the truly catastrophic cases.
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                kill_backend_child(app_handle);
            }
            _ => {}
        });
}
