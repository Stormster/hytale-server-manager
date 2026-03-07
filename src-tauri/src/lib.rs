use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;

/// Shared state holding the backend port once the sidecar reports ready.
struct BackendState {
    port: Mutex<Option<u16>>,
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

/// Kill the backend sidecar if it's still running. Safe to call multiple times.
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
    let lock = state.port.lock().await;
    lock.ok_or_else(|| "Backend not ready yet".into())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let state = Arc::new(BackendState {
                port: Mutex::new(None),
            });
            app.manage(state.clone());

            // Spawn the Python sidecar backend (restarted automatically if it exits)
            let shell = app.shell();
            let sidecar = shell
                .sidecar("server-manager-backend")
                .expect("failed to create sidecar command");

            let (first_rx, child) = sidecar.spawn().expect("failed to spawn sidecar");

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
                    while let Some(event) = rx.recv().await {
                        if let CommandEvent::Stdout(line_bytes) = event {
                            let line = String::from_utf8_lossy(&line_bytes);
                            if let Some(port_str) = line.trim().strip_prefix("BACKEND_READY:") {
                                if let Ok(port) = port_str.parse::<u16>() {
                                    let mut lock = state_clone.port.lock().await;
                                    *lock = Some(port);
                                    println!("[Tauri] Backend ready on port {port}");
                                }
                            }
                        }
                    }
                    // Backend process exited (crash or normal) – clear port and restart
                    {
                        let mut lock = state_clone.port.lock().await;
                        *lock = None;
                    }
                    eprintln!("[Tauri] Backend process exited; restarting...");
                    let shell = app_handle.shell();
                    let sidecar = match shell.sidecar("server-manager-backend") {
                        Ok(s) => s,
                        Err(e) => {
                            eprintln!("[Tauri] Failed to create sidecar: {e}");
                            break;
                        }
                    };
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
        .invoke_handler(tauri::generate_handler![get_backend_port])
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
