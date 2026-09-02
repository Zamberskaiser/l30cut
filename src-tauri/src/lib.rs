//! Tauri host for L30 CUT AI.
//!
//! Every IPC command listed here is part of the allowlisted contract mirrored
//! by `src/core/runtime/tauriRuntime.ts` on the frontend side. Responses are
//! plain JSON validated with Zod in the frontend before use.

use serde::{Deserialize, Serialize};
use sysinfo::System;

#[derive(Serialize)]
pub struct SystemDiagnostics {
    pub mode: String,
    pub simulated: bool,
    pub os: String,
    pub cpu: String,
    pub cores: u32,
    #[serde(rename = "ramGb")]
    pub ram_gb: f64,
    pub gpu: Option<String>,
    #[serde(rename = "freeDiskGb")]
    pub free_disk_gb: f64,
    #[serde(rename = "dataDir")]
    pub data_dir: String,
}

#[derive(Deserialize)]
pub struct InstallArgs {
    pub id: String,
    pub source: String,
    pub sha256: Option<String>,
}

#[tauri::command]
fn diagnostics(app: tauri::AppHandle) -> Result<SystemDiagnostics, String> {
    let mut sys = System::new_all();
    sys.refresh_all();
    let data_dir = tauri::Manager::path(&app)
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();

    Ok(SystemDiagnostics {
        mode: "tauri".into(),
        simulated: false,
        os: format!(
            "{} {}",
            System::name().unwrap_or_else(|| "Windows".into()),
            System::os_version().unwrap_or_default()
        ),
        cpu: sys
            .cpus()
            .first()
            .map(|c| c.brand().to_string())
            .unwrap_or_else(|| "unknown".into()),
        cores: sys.cpus().len() as u32,
        ram_gb: (sys.total_memory() as f64) / 1_073_741_824.0,
        gpu: None,
        free_disk_gb: 0.0,
        data_dir,
    })
}

/// Creates the on-disk layout used for models, binaries, projects and exports.
#[tauri::command]
fn prepare_data_dirs(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let base = tauri::Manager::path(&app)
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let mut created = Vec::new();
    for dir in ["models", "bin", "projects", "cache", "exports", "logs"] {
        let path = base.join(dir);
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
        created.push(path.to_string_lossy().to_string());
    }
    Ok(created)
}

/// TODO(local-binaries): download + SHA-256 verify ffmpeg/ffprobe/whisper.cpp
/// from the allowlisted `source`, streaming progress events to the frontend.
#[tauri::command]
fn install_component(_args: InstallArgs) -> Result<(), String> {
    Err("install_component ainda não implementado neste host".into())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            diagnostics,
            prepare_data_dirs,
            install_component
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o L30 CUT AI");
}
