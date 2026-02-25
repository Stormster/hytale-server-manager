use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    tauri_build::build();

    // Copy sidecar next to exe (externalBin "server-manager-backend" expects it in resource dir)
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let target_dir = env::var("CARGO_TARGET_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| manifest_dir.join("target"));
    let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".into());
    let target = env::var("TARGET").unwrap_or_else(|_| String::new());

    // Tauri externalBin naming: server-manager-backend-{target_triple}[.exe]
    let sidecar_name = if target.contains("windows") {
        "server-manager-backend-x86_64-pc-windows-msvc.exe"
    } else if target.contains("linux") {
        "server-manager-backend-x86_64-unknown-linux-gnu"
    } else {
        return; // macOS or other: no sidecar built yet
    };

    let sidecar_src = manifest_dir.join("binaries").join(sidecar_name);
    let sidecar_dest = target_dir.join(&profile).join(sidecar_name);

    if sidecar_src.is_file() {
        fs::copy(&sidecar_src, &sidecar_dest).ok();
    } else {
        eprintln!(
            "[build] Warning: sidecar not found at {:?} (run build-backend.bat on Windows or build-backend.sh on Linux)",
            sidecar_src
        );
    }
}
