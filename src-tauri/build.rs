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
    let sidecar_src = manifest_dir.join("binaries/server-manager-backend-x86_64-pc-windows-msvc.exe");
    let sidecar_dest = target_dir.join(&profile).join("server-manager-backend-x86_64-pc-windows-msvc.exe");

    if sidecar_src.is_file() {
        fs::copy(&sidecar_src, &sidecar_dest).ok();
    }
}
