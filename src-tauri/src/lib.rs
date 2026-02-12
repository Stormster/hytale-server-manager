use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;

/// Shared state holding the backend port once the sidecar reports ready.
struct BackendState {
    port: Mutex<Option<u16>>,
}

/// Tauri command: return the backend port (or 0 if not ready yet).
#[tauri::command]
async fn get_backend_port(state: tauri::State<'_, Arc<BackendState>>) -> Result<u16, String> {
    let lock = state.port.lock().await;
    lock.ok_or_else(|| "Backend not ready yet".into())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let state = Arc::new(BackendState {
                port: Mutex::new(None),
            });
            app.manage(state.clone());

            // Spawn the Python sidecar backend
            let shell = app.shell();
            let sidecar = shell
                .sidecar("server-manager-backend")
                .expect("failed to create sidecar command");

            let (mut rx, _child) = sidecar.spawn().expect("failed to spawn sidecar");

            // Listen for the BACKEND_READY:<port> line on stdout
            let state_clone = state.clone();
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent;
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
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_backend_port])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
