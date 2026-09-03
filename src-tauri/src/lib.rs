//! Tauri host for L30 CUT AI.
//!
//! Every IPC command listed here is part of the allowlisted contract mirrored
//! by `src/core/runtime/tauriRuntime.ts` on the frontend side. Responses are
//! plain JSON validated with Zod in the frontend before use.
//!
//! Security boundary: AI-proposed edits are validated natively in
//! [`ai_ops`] before anything acts on them. The WebView's TypeScript/Zod
//! layer is convenience, not a security boundary.

pub mod ai_ops;

use serde::{Deserialize, Serialize};
use sysinfo::System;
use tauri_plugin_updater::UpdaterExt;

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
fn diagnose_system(app: tauri::AppHandle) -> Result<SystemDiagnostics, String> {
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

/// Native security gate for AI-proposed edit transactions (see `ai_ops`).
/// Receives the raw JSON array of commands and returns a typed report.
/// Nothing AI-originated may be executed natively without `ok == true`.
#[tauri::command]
fn validate_ai_transaction(json: String) -> ai_ops::ValidationReport {
    ai_ops::validate_transaction_json(&json)
}

/* ------------------------- project persistence ------------------------- */

/// Only these extensions may be written/read as project files. The path itself
/// always comes from a native dialog the user interacted with.
pub fn is_project_path(path: &str) -> bool {
    let lowered = path.to_lowercase();
    lowered.ends_with(".l30cut") || lowered.ends_with(".json")
}

fn projects_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = tauri::Manager::path(app)
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("projects");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Autosave slot inside the app data dir, keyed by project id.
#[tauri::command]
fn save_project(app: tauri::AppHandle, project: serde_json::Value) -> Result<String, String> {
    let id = project
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "projeto sem id".to_string())?;
    if id.contains(['/', '\\', '.', ':']) {
        return Err("id de projeto inválido".into());
    }
    let path = projects_dir(&app)?.join(format!("{id}.l30cut"));
    let body = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;
    std::fs::write(&path, body).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn load_project(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<Option<serde_json::Value>, String> {
    if project_id.contains(['/', '\\', '.', ':']) {
        return Err("id de projeto inválido".into());
    }
    let path = projects_dir(&app)?.join(format!("{project_id}.l30cut"));
    if !path.exists() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let value: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    // Files written by "Salvar como" carry an envelope: unwrap it.
    Ok(Some(match value.get("project") {
        Some(inner) if value.get("format").is_some() => inner.clone(),
        _ => value,
    }))
}

/// Writes a user-chosen `*.l30cut` file (path comes from the save dialog).
#[tauri::command]
fn write_project_file(path: String, contents: String) -> Result<String, String> {
    if !is_project_path(&path) {
        return Err("extensão de arquivo não permitida".into());
    }
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(path)
}

/// Reads a user-chosen project file as text; parsing/validation happens in the
/// frontend against the typed schema.
#[tauri::command]
fn read_project_file(path: String) -> Result<String, String> {
    if !is_project_path(&path) {
        return Err("extensão de arquivo não permitida".into());
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Recent project files stored in the app data dir.
#[tauri::command]
fn list_projects(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let dir = projects_dir(&app)?;
    let mut found = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if is_project_path(&path.to_string_lossy()) {
            found.push(path.to_string_lossy().to_string());
        }
    }
    found.sort();
    Ok(found)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            diagnose_system,
            prepare_data_dirs,
            install_component,
            validate_ai_transaction,
            save_project,
            load_project,
            write_project_file,
            read_project_file,
            list_projects
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o L30 CUT AI");
}

#[cfg(test)]
mod tests {
    use super::is_project_path;

    #[test]
    fn accepts_only_project_extensions() {
        assert!(is_project_path("C:\\Users\\me\\meu.l30cut"));
        assert!(is_project_path("/tmp/a.JSON"));
        assert!(!is_project_path("C:\\Windows\\System32\\evil.exe"));
        assert!(!is_project_path("script.bat"));
    }
}
