//! Native media layer: local binaries (FFmpeg / ffprobe / whisper.cpp),
//! media probing, proxy thumbnails, silence detection, transcription and
//! sequence export.
//!
//! Security notes:
//! * No shell is ever spawned. Every process call is an argv vector pointing at
//!   a binary inside the app data dir (or on PATH), never a user-supplied string.
//! * Downloads only happen from the allowlisted origins in [`ALLOWED_ORIGINS`],
//!   mirroring `ALLOWED_DOWNLOAD_ORIGINS` on the frontend side.
//! * Media paths always come from the native file dialog the user interacted with.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{Emitter, Manager};

/* ------------------------------ helpers ------------------------------ */

pub const ALLOWED_ORIGINS: [&str; 3] = [
    "https://github.com",
    "https://objects.githubusercontent.com",
    "https://huggingface.co",
];

/// FFmpeg builds (GPL, static, win64) and whisper.cpp release used by the setup.
const FFMPEG_ZIP: &str =
    "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";
const WHISPER_ZIP: &str =
    "https://github.com/ggml-org/whisper.cpp/releases/download/b4938/whisper-bin-x64.zip";
const MODEL_BASE: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

/// Local generative stack (all CPU-capable, pinned releases).
const PIPER_ZIP: &str =
    "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip";
const PIPER_VOICE_BASE: &str =
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium";
const PIPER_VOICE_NAME: &str = "pt_BR-faber-medium.onnx";
const SD_ZIP: &str = "https://github.com/leejet/stable-diffusion.cpp/releases/download/master-841-6b3edaa/sd-master-6b3edaa-bin-win-cpu-x64.zip";
const SD_MODEL_URL: &str = "https://huggingface.co/Comfy-Org/stable-diffusion-v1-5-archive/resolve/main/v1-5-pruned-emaonly-fp16.safetensors";
/// sd.cpp renamed its executable across releases: newer zips ship `sd-cli.exe`.
pub const SD_BINARIES: &[&str] = &["sd", "sd-cli", "stable-diffusion"];
const SD_MODEL_NAME: &str = "v1-5-pruned-emaonly-fp16.safetensors";
const LLAMA_ZIP: &str =
    "https://github.com/ggml-org/llama.cpp/releases/download/b10793/llama-b10793-bin-win-cpu-x64.zip";
const QWEN_7B: (&str, &str) = (
    "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf",
    "Qwen2.5-7B-Instruct-Q4_K_M.gguf",
);
const QWEN_3B: (&str, &str) = (
    "https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf",
    "Qwen2.5-3B-Instruct-Q4_K_M.gguf",
);

/// Picks the script model by install profile: the light profile keeps the 3B.
pub fn llm_model_for(profile: Option<&str>) -> (&'static str, &'static str) {
    match profile {
        Some("light") => QWEN_3B,
        _ => QWEN_7B,
    }
}


pub fn origin_allowed(url: &str) -> bool {
    ALLOWED_ORIGINS.iter().any(|o| url.starts_with(o))
}

fn exe(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

/// Platform-correct executable file name (`ffmpeg` / `ffmpeg.exe`).
pub fn exe_name(name: &str) -> String {
    exe(name)
}

pub fn app_dir(app: &tauri::AppHandle, sub: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(sub);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Resolves a bundled binary, falling back to the same name on PATH so a
/// system-wide FFmpeg install also works.
pub fn tool(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    let local = app_dir(app, "bin")?.join(exe(name));
    if local.exists() {
        return Ok(local);
    }
    Ok(PathBuf::from(name))
}

/// True when the tool can actually be launched (bundled or on PATH).
pub fn tool_exists(app: &tauri::AppHandle, name: &str) -> bool {
    match tool(app, name) {
        Ok(path) => {
            if path.exists() {
                return true;
            }
            spawnable(&path)
                .arg("-version")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        }
        Err(_) => false,
    }
}

fn spawnable(program: &Path) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

pub fn run(program: &Path, args: &[String]) -> Result<std::process::Output, String> {
    spawnable(program)
        .args(args)
        .output()
        .map_err(|e| format!("não foi possível executar {}: {e}", program.display()))
}

/// Spawns a tool with piped stdin/stdout, for engines that read text from stdin.
pub fn spawn_piped(program: &Path, args: &[String]) -> Result<std::process::Child, String> {
    spawnable(program)
        .args(args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("não foi possível executar {}: {e}", program.display()))
}

pub fn missing_tool(name: &str) -> String {
    format!(
        "{name} não está instalado. Abra a tela de configuração e instale os componentes locais."
    )
}

pub fn sanitize_stem(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == ' ' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim().to_string();
    if trimmed.is_empty() {
        "export".into()
    } else {
        trimmed
    }
}


fn rand_id(prefix: &str) -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{prefix}-{nanos:x}")
}

/* ------------------------------ components ------------------------------ */

#[derive(Serialize, Clone)]
pub struct ComponentStatus {
    pub id: String,
    pub name: String,
    pub description: String,
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub optional: Option<bool>,
}

fn status(id: &str, name: &str, description: &str, ready: bool, source: &str) -> ComponentStatus {
    ComponentStatus {
        id: id.into(),
        name: name.into(),
        description: description.into(),
        state: if ready { "ready".into() } else { "missing".into() },
        version: None,
        source: Some(source.into()),
        error: None,
        optional: None,
    }
}

fn binary_ready(app: &tauri::AppHandle, name: &str) -> bool {
    if app_dir(app, "bin").map(|d| d.join(exe(name)).exists()) == Ok(true) {
        return true;
    }
    // PATH fallback: probe the tool with `-version`.
    run(&PathBuf::from(name), &["-version".to_string()])
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn whisper_binary(app: &tauri::AppHandle) -> Option<PathBuf> {
    let bin = app_dir(app, "bin").ok()?;
    for candidate in ["whisper-cli", "main", "whisper"] {
        let path = bin.join(exe(candidate));
        if path.exists() {
            return Some(path);
        }
    }
    None
}

fn model_path(app: &tauri::AppHandle, model: &str) -> Result<PathBuf, String> {
    if model.contains(['/', '\\', ':']) || !model.ends_with(".bin") {
        return Err("nome de modelo inválido".into());
    }
    Ok(app_dir(app, "models")?.join(model))
}

fn any_model(app: &tauri::AppHandle) -> Option<PathBuf> {
    let dir = app_dir(app, "models").ok()?;
    let mut found: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map(|e| e == "bin").unwrap_or(false))
        .collect();
    found.sort();
    found.into_iter().next()
}

/// First file in `sub` whose extension is one of `exts` (case-insensitive).
pub fn first_asset(app: &tauri::AppHandle, sub: &str, exts: &[&str]) -> Option<PathBuf> {
    let dir = app_dir(app, sub).ok()?;
    let mut found: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.extension()
                .and_then(|e| e.to_str())
                .map(|e| exts.iter().any(|w| e.eq_ignore_ascii_case(w)))
                .unwrap_or(false)
        })
        .collect();
    found.sort();
    found.into_iter().next()
}

/// First bundled binary among `names` that exists in the app `bin` dir.
pub fn bundled_binary(app: &tauri::AppHandle, names: &[&str]) -> Option<PathBuf> {
    let bin = app_dir(app, "bin").ok()?;
    names
        .iter()
        .map(|n| bin.join(exe(n)))
        .find(|path| path.exists())
}

fn optional(mut component: ComponentStatus) -> ComponentStatus {
    component.optional = Some(true);
    component
}

/// Quick TCP probe for a local LLM provider (Ollama / LM Studio default port).
fn llm_provider_ready() -> bool {
    use std::net::{TcpStream, ToSocketAddrs};
    let addr = match ("127.0.0.1", 11434u16).to_socket_addrs().ok().and_then(|mut it| it.next()) {
        Some(addr) => addr,
        None => return false,
    };
    TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(400)).is_ok()
}

#[tauri::command]
pub fn list_components(app: tauri::AppHandle) -> Result<Vec<ComponentStatus>, String> {
    let list = vec![
        status(
            "ffmpeg",
            "FFmpeg",
            "Motor de mídia para decode, proxy e exportação H.264.",
            binary_ready(&app, "ffmpeg"),
            "https://github.com/BtbN/FFmpeg-Builds/releases",
        ),
        status(
            "ffprobe",
            "ffprobe",
            "Leitura de metadados, duração, fps e faixas de áudio.",
            binary_ready(&app, "ffprobe"),
            "https://github.com/BtbN/FFmpeg-Builds/releases",
        ),
        status(
            "whisper.cpp",
            "whisper.cpp",
            "Transcrição local, sem enviar áudio para a internet.",
            whisper_binary(&app).is_some(),
            "https://github.com/ggml-org/whisper.cpp/releases",
        ),
        status(
            "whisper-model",
            "Modelo de transcrição",
            "Peso GGML escolhido pelo perfil.",
            any_model(&app).is_some(),
            "https://huggingface.co/ggerganov/whisper.cpp",
        ),
        optional(status(
            "llama-server",
            "llama.cpp server",
            "Servidor de LLM local para o roteirista do criador de vídeos.",
            bundled_binary(&app, &["llama-server"]).is_some(),
            "https://github.com/ggml-org/llama.cpp/releases",
        )),
        optional(status(
            "llm-model",
            "Modelo de roteiro (Qwen2.5)",
            "Q4_K_M em GGUF: 3B no perfil Leve, 7B nos demais.",
            first_asset(&app, "llm", &["gguf"]).is_some(),
            "https://huggingface.co/bartowski",
        )),
        optional(status(
            "piper",
            "Piper TTS",
            "Narração offline em português, rápida até em CPU.",
            bundled_binary(&app, &["piper", "piper-cli"]).is_some(),
            "https://github.com/rhasspy/piper/releases",
        )),
        optional(status(
            "piper-voice",
            "Voz PT-BR (faber medium)",
            "Modelo de voz brasileira usado na narração.",
            first_asset(&app, "voices", &["onnx"]).is_some(),
            "https://huggingface.co/rhasspy/piper-voices",
        )),
        optional(status(
            "stable-diffusion",
            "stable-diffusion.cpp",
            "Geração de imagens das cenas direto na sua máquina.",
            bundled_binary(&app, SD_BINARIES).is_some(),
            "https://github.com/leejet/stable-diffusion.cpp/releases",
        )),
        optional(status(
            "sd-model",
            "Modelo de imagem (SD 1.5)",
            "Checkpoint fp16 aberto, ~2 GB, roda em CPU.",
            first_asset(&app, "diffusion", &["safetensors", "gguf", "ckpt"]).is_some(),
            "https://huggingface.co/Comfy-Org/stable-diffusion-v1-5-archive",
        )),
        optional(status(
            "llm-provider",
            "Provider de LLM externo",
            "Alternativa ao llama.cpp: Ollama ou LM Studio no endpoint local.",
            llm_provider_ready(),
            "http://127.0.0.1:11434",
        )),
    ];
    Ok(list)
}


async fn download_to(
    app: &tauri::AppHandle,
    component: &str,
    url: &str,
    dest: &Path,
) -> Result<(), String> {
    if !origin_allowed(url) {
        return Err(format!("origem não permitida: {url}"));
    }
    let response = reqwest::get(url).await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("download falhou ({}) em {url}", response.status()));
    }
    let total = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut file = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;
    use std::io::Write;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        let progress = if total > 0 {
            (downloaded as f64 / total as f64).min(0.99)
        } else {
            0.5
        };
        let _ = app.emit(
            "component-progress",
            serde_json::json!({ "componentId": component, "progress": progress }),
        );
    }
    file.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// Flat-extracts the wanted files out of a zip into `dest`.
/// `wanted` matches on the file name; empty means "every file".
fn extract_zip(archive_path: &Path, dest: &Path, wanted: &[&str]) -> Result<Vec<String>, String> {
    let file = std::fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut written = Vec::new();
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let full = entry.name().to_string();
        let name = full.rsplit(['/', '\\']).next().unwrap_or(&full).to_string();
        if name.is_empty() {
            continue;
        }
        let keep = wanted.is_empty() || wanted.iter().any(|w| name.eq_ignore_ascii_case(w));
        if !keep {
            continue;
        }
        let out = dest.join(&name);
        // A file already in use (antivirus lock, running exe) must not abort the
        // whole install: skip it and keep going.
        let mut sink = match std::fs::File::create(&out) {
            Ok(sink) => sink,
            Err(_) => continue,
        };
        if std::io::copy(&mut entry, &mut sink).is_err() {
            continue;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&out, std::fs::Permissions::from_mode(0o755));
        }
        written.push(name);
    }
    if written.is_empty() {
        return Err("o pacote baixado não continha os arquivos esperados".into());
    }
    Ok(written)
}

/// Extracts a zip into `dest` preserving its folder tree, dropping a single
/// shared root folder. Needed by Piper (it ships `espeak-ng-data/`) and sd.cpp.
fn extract_zip_tree(archive_path: &Path, dest: &Path) -> Result<usize, String> {
    let file = std::fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    // A shared first segment is only stripped when every entry agrees on it.
    let mut root: Option<String> = None;
    let mut shared = true;
    for i in 0..zip.len() {
        let entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().replace('\\', "/");
        let first = name.split('/').next().unwrap_or("").to_string();
        if first.is_empty() || !name.contains('/') && !entry.is_dir() {
            shared = false;
            break;
        }
        match &root {
            None => root = Some(first),
            Some(current) if *current != first => {
                shared = false;
                break;
            }
            _ => {}
        }
    }
    let strip = if shared { root } else { None };

    let mut written = 0usize;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let raw = entry.name().replace('\\', "/");
        let relative = match &strip {
            Some(prefix) => raw
                .strip_prefix(&format!("{prefix}/"))
                .unwrap_or(&raw)
                .to_string(),
            None => raw.clone(),
        };
        // Refuse traversal or absolute paths coming from the archive.
        if relative.is_empty()
            || relative.starts_with('/')
            || relative.split('/').any(|part| part == "..")
        {
            continue;
        }
        let out = dest.join(&relative);
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut sink = match std::fs::File::create(&out) {
            Ok(sink) => sink,
            Err(_) => continue,
        };
        if std::io::copy(&mut entry, &mut sink).is_err() {
            continue;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&out, std::fs::Permissions::from_mode(0o755));
        }
        written += 1;
    }
    if written == 0 {
        return Err("o pacote baixado não continha arquivos".into());
    }
    Ok(written)
}

/// Downloads and installs a local component. Real network access, restricted to
/// the allowlisted origins; progress is emitted on `component-progress`.
#[tauri::command]
pub async fn install_component(
    app: tauri::AppHandle,
    component_id: String,
    model: Option<String>,
    profile_id: Option<String>,
    cancel: Option<bool>,
) -> Result<ComponentStatus, String> {
    if cancel.unwrap_or(false) {
        // Cancellation is advisory: the partial file is discarded on the next run.
        return Ok(status("cancel", "cancelado", "", false, ""));
    }
    let bin = app_dir(&app, "bin")?;
    let cache = app_dir(&app, "cache")?;

    match component_id.as_str() {
        "ffmpeg" | "ffprobe" => {
            let zip_path = cache.join("ffmpeg-win64.zip");
            download_to(&app, &component_id, FFMPEG_ZIP, &zip_path).await?;
            extract_zip(
                &zip_path,
                &bin,
                &["ffmpeg.exe", "ffprobe.exe", "ffmpeg", "ffprobe"],
            )?;
            let _ = std::fs::remove_file(&zip_path);
        }
        "whisper.cpp" => {
            let zip_path = cache.join("whisper-bin.zip");
            download_to(&app, &component_id, WHISPER_ZIP, &zip_path).await?;
            // Keep every file: whisper needs its companion DLLs next to the exe.
            extract_zip(&zip_path, &bin, &[])?;
            let _ = std::fs::remove_file(&zip_path);
        }
        "whisper-model" => {
            let model = model.unwrap_or_else(|| "ggml-small.bin".into());
            let dest = model_path(&app, &model)?;
            let url = format!("{MODEL_BASE}/{model}");
            download_to(&app, &component_id, &url, &dest).await?;
        }
        "llama-server" => {
            let zip_path = cache.join("llama-bin.zip");
            download_to(&app, &component_id, LLAMA_ZIP, &zip_path).await?;
            // Flat layout: the server needs its DLLs next to the executable.
            extract_zip(&zip_path, &bin, &[])?;
            let _ = std::fs::remove_file(&zip_path);
        }
        "llm-model" => {
            let (url, name) = llm_model_for(profile_id.as_deref());
            let dest = app_dir(&app, "llm")?.join(name);
            download_to(&app, &component_id, url, &dest).await?;
        }
        "piper" => {
            let zip_path = cache.join("piper-win64.zip");
            download_to(&app, &component_id, PIPER_ZIP, &zip_path).await?;
            // Tree extraction: piper resolves `espeak-ng-data/` next to the exe.
            extract_zip_tree(&zip_path, &bin)?;
            let _ = std::fs::remove_file(&zip_path);
        }
        "piper-voice" => {
            let voices = app_dir(&app, "voices")?;
            download_to(
                &app,
                &component_id,
                &format!("{PIPER_VOICE_BASE}/{PIPER_VOICE_NAME}"),
                &voices.join(PIPER_VOICE_NAME),
            )
            .await?;
            // The companion json carries the phoneme config piper requires.
            download_to(
                &app,
                &component_id,
                &format!("{PIPER_VOICE_BASE}/{PIPER_VOICE_NAME}.json"),
                &voices.join(format!("{PIPER_VOICE_NAME}.json")),
            )
            .await?;
        }
        "stable-diffusion" => {
            let zip_path = cache.join("stable-diffusion-win64.zip");
            download_to(&app, &component_id, SD_ZIP, &zip_path).await?;
            extract_zip_tree(&zip_path, &bin)?;
            let _ = std::fs::remove_file(&zip_path);
        }
        "sd-model" => {
            let dest = app_dir(&app, "diffusion")?.join(SD_MODEL_NAME);
            download_to(&app, &component_id, SD_MODEL_URL, &dest).await?;
        }
        "llm-provider" => {
            // Nothing to download: this item only verifies that a local provider
            // (Ollama / LM Studio) is answering on the default port.
            if !llm_provider_ready() {
                return Err(
                    "Nenhum provider respondeu em 127.0.0.1:11434. Abra o Ollama ou o LM Studio e tente de novo — ou instale o componente llama.cpp server, que é automático."
                        .into(),
                );
            }
        }
        other => return Err(format!("componente desconhecido: {other}")),
    }


    let list = list_components(app.clone())?;
    let found = list
        .into_iter()
        .find(|c| c.id == component_id)
        .ok_or_else(|| "componente não encontrado após a instalação".to_string())?;
    log_setup(&app, &component_id, &found.state);
    if found.state != "ready" {
        return Err(format!(
            "{} baixou, mas o programa não apareceu em {}. Feche o antivírus/o app que possa estar usando o arquivo e tente de novo.",
            found.name,
            app_dir(&app, "bin")
                .map(|d| d.to_string_lossy().to_string())
                .unwrap_or_else(|_| "pasta de dados".into())
        ));
    }
    Ok(found)
}

/// Appends one line per install attempt to `logs/setup.log` so a failing
/// component can be diagnosed after the fact.
fn log_setup(app: &tauri::AppHandle, component: &str, state: &str) {
    use std::io::Write;
    if let Ok(dir) = app_dir(app, "logs") {
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join("setup.log"))
        {
            let _ = writeln!(file, "{component} -> {state}");
        }
    }
}

/* ------------------------------ probing ------------------------------ */

fn parse_ratio(raw: Option<&str>) -> (u32, u32) {
    let value = raw.unwrap_or("30/1");
    let mut parts = value.split('/');
    let num = parts.next().and_then(|n| n.parse::<u32>().ok()).unwrap_or(30);
    let den = parts.next().and_then(|n| n.parse::<u32>().ok()).unwrap_or(1);
    if num == 0 || den == 0 {
        (30, 1)
    } else {
        (num, den)
    }
}

fn is_image(path: &str) -> bool {
    let lowered = path.to_lowercase();
    ["png", "jpg", "jpeg", "webp", "bmp", "gif"]
        .iter()
        .any(|ext| lowered.ends_with(&format!(".{ext}")))
}

#[derive(Serialize)]
pub struct MediaAssetPayload {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub path: String,
    #[serde(rename = "durationUs")]
    pub duration_us: i64,
    pub width: u32,
    pub height: u32,
    #[serde(rename = "fpsNum")]
    pub fps_num: u32,
    #[serde(rename = "fpsDen")]
    pub fps_den: u32,
    #[serde(rename = "audioChannels")]
    pub audio_channels: u32,
    #[serde(rename = "sizeBytes")]
    pub size_bytes: u64,
    #[serde(rename = "proxyReady")]
    pub proxy_ready: bool,
    pub demo: bool,
}

/// Reads real metadata with ffprobe. Returns the asset shape the frontend
/// validates with `MediaAssetSchema`.
#[tauri::command]
pub fn probe_media(app: tauri::AppHandle, path: String) -> Result<MediaAssetPayload, String> {
    let file = PathBuf::from(&path);
    if !file.exists() {
        return Err(format!("arquivo não encontrado: {path}"));
    }
    let ffprobe = tool(&app, "ffprobe")?;
    let args: Vec<String> = vec![
        "-v".into(),
        "error".into(),
        "-print_format".into(),
        "json".into(),
        "-show_format".into(),
        "-show_streams".into(),
        path.clone(),
    ];
    let output = run(&ffprobe, &args).map_err(|_| missing_tool("ffprobe"))?;
    if !output.status.success() {
        return Err(format!(
            "ffprobe falhou: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;
    let streams = json
        .get("streams")
        .and_then(|s| s.as_array())
        .cloned()
        .unwrap_or_default();
    let video = streams
        .iter()
        .find(|s| s.get("codec_type").and_then(|v| v.as_str()) == Some("video"));
    let audio = streams
        .iter()
        .find(|s| s.get("codec_type").and_then(|v| v.as_str()) == Some("audio"));

    let seconds = json
        .get("format")
        .and_then(|f| f.get("duration"))
        .and_then(|d| d.as_str())
        .and_then(|d| d.parse::<f64>().ok())
        .unwrap_or(0.0);

    let image = is_image(&path) || (video.is_some() && audio.is_none() && seconds == 0.0);
    let kind = if image {
        "image"
    } else if video.is_some() {
        "video"
    } else {
        "audio"
    };
    let duration_us = if image && seconds <= 0.0 {
        5_000_000
    } else {
        (seconds * 1_000_000.0).round() as i64
    };
    let (fps_num, fps_den) = parse_ratio(
        video
            .and_then(|v| v.get("r_frame_rate"))
            .and_then(|v| v.as_str()),
    );
    let name = file
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "mídia".into());

    Ok(MediaAssetPayload {
        id: rand_id("asset"),
        kind: kind.into(),
        name,
        path,
        duration_us: duration_us.max(0),
        width: video
            .and_then(|v| v.get("width"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32,
        height: video
            .and_then(|v| v.get("height"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32,
        fps_num,
        fps_den,
        audio_channels: audio
            .and_then(|a| a.get("channels"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32,
        size_bytes: std::fs::metadata(&file).map(|m| m.len()).unwrap_or(0),
        proxy_ready: false,
        demo: false,
    })
}

/* --------------------------- proxy thumbnails --------------------------- */

/// Extracts evenly spaced JPEG frames and returns them as `data:` URLs the
/// WebView can render without opening a filesystem protocol.
#[tauri::command]
pub fn generate_proxy(
    app: tauri::AppHandle,
    asset_id: String,
    path: String,
) -> Result<Vec<String>, String> {
    let ffmpeg = tool(&app, "ffmpeg")?;
    let dir = app_dir(&app, "cache")?.join(sanitize_stem(&asset_id));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let pattern = dir.join("thumb_%03d.jpg");
    let args: Vec<String> = vec![
        "-y".into(),
        "-i".into(),
        path,
        "-vf".into(),
        "fps=1/2,scale=240:-2".into(),
        "-frames:v".into(),
        "8".into(),
        pattern.to_string_lossy().to_string(),
    ];
    let output = run(&ffmpeg, &args).map_err(|_| missing_tool("FFmpeg"))?;
    if !output.status.success() {
        return Err(format!(
            "FFmpeg falhou ao gerar o proxy: {}",
            String::from_utf8_lossy(&output.stderr)
                .lines()
                .last()
                .unwrap_or("")
                .to_string()
        ));
    }
    let mut files: Vec<PathBuf> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map(|e| e == "jpg").unwrap_or(false))
        .collect();
    files.sort();
    use base64::Engine;
    let engine = base64::engine::general_purpose::STANDARD;
    Ok(files
        .iter()
        .filter_map(|p| std::fs::read(p).ok())
        .map(|bytes| format!("data:image/jpeg;base64,{}", engine.encode(bytes)))
        .collect())
}

/* --------------------------- silence detection --------------------------- */

#[derive(Serialize)]
pub struct SilenceRange {
    #[serde(rename = "startUs")]
    pub start_us: i64,
    #[serde(rename = "endUs")]
    pub end_us: i64,
}

pub fn parse_silencedetect(log: &str, total_us: i64) -> Vec<SilenceRange> {
    let mut ranges: Vec<SilenceRange> = Vec::new();
    let mut open: Option<i64> = None;
    for line in log.lines() {
        if let Some(idx) = line.find("silence_start:") {
            let value = line[idx + "silence_start:".len()..]
                .split('|')
                .next()
                .unwrap_or("")
                .trim()
                .parse::<f64>()
                .ok();
            if let Some(seconds) = value {
                open = Some((seconds * 1_000_000.0).round() as i64);
            }
        } else if let Some(idx) = line.find("silence_end:") {
            let value = line[idx + "silence_end:".len()..]
                .split('|')
                .next()
                .unwrap_or("")
                .trim()
                .parse::<f64>()
                .ok();
            if let (Some(start), Some(seconds)) = (open, value) {
                let end = (seconds * 1_000_000.0).round() as i64;
                if end > start {
                    ranges.push(SilenceRange {
                        start_us: start,
                        end_us: end,
                    });
                }
                open = None;
            }
        }
    }
    // A silence still open at EOF closes at the asset duration.
    if let Some(start) = open {
        if total_us > start {
            ranges.push(SilenceRange {
                start_us: start,
                end_us: total_us,
            });
        }
    }
    ranges
}

#[tauri::command]
pub fn detect_silence(
    app: tauri::AppHandle,
    path: String,
    threshold_db: f64,
    min_silence_us: i64,
) -> Result<Vec<SilenceRange>, String> {
    let ffmpeg = tool(&app, "ffmpeg")?;
    let seconds = (min_silence_us.max(100_000) as f64) / 1_000_000.0;
    let db = threshold_db.clamp(-90.0, 0.0);
    let args: Vec<String> = vec![
        "-hide_banner".into(),
        "-i".into(),
        path,
        "-af".into(),
        format!("silencedetect=noise={db}dB:d={seconds:.3}"),
        "-f".into(),
        "null".into(),
        "-".into(),
    ];
    let output = run(&ffmpeg, &args).map_err(|_| missing_tool("FFmpeg"))?;
    let log = String::from_utf8_lossy(&output.stderr).to_string();
    Ok(parse_silencedetect(&log, 0))
}

/* ------------------------------ transcription ------------------------------ */

#[derive(Serialize)]
pub struct TranscriptSegment {
    pub id: String,
    #[serde(rename = "assetId")]
    pub asset_id: String,
    #[serde(rename = "startUs")]
    pub start_us: i64,
    #[serde(rename = "endUs")]
    pub end_us: i64,
    pub text: String,
}

/// Extracts 16 kHz mono audio with FFmpeg, then runs whisper.cpp locally.
#[tauri::command]
pub fn transcribe_asset(
    app: tauri::AppHandle,
    asset_id: String,
    path: String,
) -> Result<Vec<TranscriptSegment>, String> {
    let ffmpeg = tool(&app, "ffmpeg")?;
    let whisper = whisper_binary(&app).ok_or_else(|| missing_tool("whisper.cpp"))?;
    let model = any_model(&app).ok_or_else(|| missing_tool("o modelo de transcrição"))?;
    let cache = app_dir(&app, "cache")?;
    let stem = sanitize_stem(&asset_id);
    let wav = cache.join(format!("{stem}.wav"));

    let wav_args: Vec<String> = vec![
        "-y".into(),
        "-i".into(),
        path,
        "-vn".into(),
        "-ac".into(),
        "1".into(),
        "-ar".into(),
        "16000".into(),
        "-f".into(),
        "wav".into(),
        wav.to_string_lossy().to_string(),
    ];
    let extract = run(&ffmpeg, &wav_args).map_err(|_| missing_tool("FFmpeg"))?;
    if !extract.status.success() {
        return Err("não foi possível extrair o áudio para transcrição".into());
    }

    let out_prefix = cache.join(&stem);
    let whisper_args: Vec<String> = vec![
        "-m".into(),
        model.to_string_lossy().to_string(),
        "-f".into(),
        wav.to_string_lossy().to_string(),
        "-l".into(),
        "pt".into(),
        "-oj".into(),
        "-of".into(),
        out_prefix.to_string_lossy().to_string(),
    ];
    let result = run(&whisper, &whisper_args)?;
    if !result.status.success() {
        return Err(format!(
            "whisper.cpp falhou: {}",
            String::from_utf8_lossy(&result.stderr)
                .lines()
                .last()
                .unwrap_or("")
        ));
    }
    let json_path = cache.join(format!("{stem}.json"));
    let text = std::fs::read_to_string(&json_path)
        .map_err(|_| "whisper.cpp não gerou o arquivo de transcrição".to_string())?;
    let parsed: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let items = parsed
        .get("transcription")
        .and_then(|t| t.as_array())
        .cloned()
        .unwrap_or_default();

    let mut segments = Vec::new();
    for (index, item) in items.iter().enumerate() {
        let offsets = item.get("offsets");
        let from = offsets
            .and_then(|o| o.get("from"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let to = offsets
            .and_then(|o| o.get("to"))
            .and_then(|v| v.as_i64())
            .unwrap_or(from);
        let body = item
            .get("text")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if body.is_empty() {
            continue;
        }
        segments.push(TranscriptSegment {
            id: format!("{asset_id}-seg-{index}"),
            asset_id: asset_id.clone(),
            start_us: from * 1_000,
            end_us: to * 1_000,
            text: body,
        });
    }
    Ok(segments)
}

/// Transcribes a short microphone recording made in the app (voice commands for
/// the assistant). The audio never leaves the machine: FFmpeg normalizes it to
/// 16 kHz mono and whisper.cpp reads it from the local cache folder.
#[tauri::command]
pub fn transcribe_speech(
    app: tauri::AppHandle,
    audio: Vec<u8>,
    extension: String,
) -> Result<String, String> {
    if audio.len() < 1_024 {
        return Err("a gravação ficou vazia; fale por alguns segundos e tente de novo".into());
    }
    if audio.len() > 40 * 1_024 * 1_024 {
        return Err("a gravação é longa demais; grave um comando mais curto".into());
    }
    let ffmpeg = tool(&app, "ffmpeg")?;
    let whisper = whisper_binary(&app).ok_or_else(|| missing_tool("whisper.cpp"))?;
    let model = any_model(&app).ok_or_else(|| missing_tool("o modelo de transcrição"))?;
    let cache = app_dir(&app, "cache")?;

    // A fresh stem per recording keeps concurrent dictations from overwriting
    // each other's wav/json files.
    let stem = sanitize_stem(&format!(
        "dictation-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ));
    let ext = sanitize_stem(&extension);
    let ext = if ext.is_empty() { "wav".to_string() } else { ext };
    let raw = cache.join(format!("{stem}-in.{ext}"));
    let wav = cache.join(format!("{stem}.wav"));
    std::fs::write(&raw, &audio).map_err(|e| format!("não foi possível salvar a gravação: {e}"))?;

    let convert = run(
        &ffmpeg,
        &[
            "-y".into(),
            "-i".into(),
            raw.to_string_lossy().to_string(),
            "-vn".into(),
            "-ac".into(),
            "1".into(),
            "-ar".into(),
            "16000".into(),
            "-f".into(),
            "wav".into(),
            wav.to_string_lossy().to_string(),
        ],
    )
    .map_err(|_| missing_tool("FFmpeg"))?;
    let _ = std::fs::remove_file(&raw);
    if !convert.status.success() {
        return Err("não foi possível preparar o áudio da gravação".into());
    }

    let out_prefix = cache.join(&stem);
    let result = run(
        &whisper,
        &[
            "-m".into(),
            model.to_string_lossy().to_string(),
            "-f".into(),
            wav.to_string_lossy().to_string(),
            "-l".into(),
            "pt".into(),
            "-oj".into(),
            "-of".into(),
            out_prefix.to_string_lossy().to_string(),
        ],
    )?;
    let _ = std::fs::remove_file(&wav);
    if !result.status.success() {
        return Err(format!(
            "whisper.cpp falhou: {}",
            String::from_utf8_lossy(&result.stderr)
                .lines()
                .last()
                .unwrap_or("")
        ));
    }

    let json_path = cache.join(format!("{stem}.json"));
    let text = std::fs::read_to_string(&json_path)
        .map_err(|_| "whisper.cpp não gerou o arquivo de transcrição".to_string())?;
    let _ = std::fs::remove_file(&json_path);
    let parsed: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let spoken = parsed
        .get("transcription")
        .and_then(|t| t.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("text").and_then(|v| v.as_str()))
                .map(str::trim)
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default();
    let spoken = spoken.split_whitespace().collect::<Vec<_>>().join(" ");
    if spoken.is_empty() {
        return Err("não entendi o que foi falado; grave novamente mais perto do microfone".into());
    }
    Ok(spoken)
}

/* --------------------------------- export --------------------------------- */

#[derive(Deserialize)]
pub struct ExportPreset {
    pub width: u32,
    pub height: u32,
    pub crf: u32,
    #[serde(rename = "audioBitrateKbps")]
    pub audio_bitrate_kbps: u32,
}

#[derive(Serialize)]
pub struct ExportResult {
    #[serde(rename = "outputPath")]
    pub output_path: String,
    pub bytes: u64,
    pub simulated: bool,
}

struct RenderClip {
    path: String,
    start_us: i64,
    in_us: i64,
    out_us: i64,
    has_audio: bool,
}

fn number(value: Option<&serde_json::Value>) -> i64 {
    value.and_then(|v| v.as_i64()).unwrap_or(0)
}

/// Renders the active sequence's video track with FFmpeg: every clip is trimmed
/// from its source, normalized to the preset canvas and concatenated in order.
#[tauri::command]
pub fn export_sequence(
    app: tauri::AppHandle,
    project: serde_json::Value,
    sequence_id: String,
    preset: ExportPreset,
    output_name: String,
    overwrite: bool,
) -> Result<ExportResult, String> {
    let ffmpeg = tool(&app, "ffmpeg")?;
    let sequences = project
        .get("sequences")
        .and_then(|s| s.as_array())
        .ok_or_else(|| "projeto sem sequências".to_string())?;
    let sequence = sequences
        .iter()
        .find(|s| s.get("id").and_then(|v| v.as_str()) == Some(sequence_id.as_str()))
        .ok_or_else(|| "sequência não encontrada".to_string())?;
    let assets = project
        .get("assets")
        .and_then(|a| a.as_array())
        .cloned()
        .unwrap_or_default();
    let tracks = sequence
        .get("tracks")
        .and_then(|t| t.as_array())
        .cloned()
        .unwrap_or_default();
    let video_track_ids: Vec<String> = tracks
        .iter()
        .filter(|t| t.get("kind").and_then(|v| v.as_str()) == Some("video"))
        .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(String::from))
        .collect();

    let mut clips: Vec<RenderClip> = Vec::new();
    for clip in sequence
        .get("clips")
        .and_then(|c| c.as_array())
        .cloned()
        .unwrap_or_default()
    {
        let track_id = clip.get("trackId").and_then(|v| v.as_str()).unwrap_or("");
        if !video_track_ids.iter().any(|id| id == track_id) {
            continue;
        }
        let asset_id = clip.get("assetId").and_then(|v| v.as_str()).unwrap_or("");
        let asset = assets
            .iter()
            .find(|a| a.get("id").and_then(|v| v.as_str()) == Some(asset_id));
        let Some(asset) = asset else { continue };
        if asset.get("demo").and_then(|v| v.as_bool()) == Some(true) {
            return Err("a sequência contém mídia de demonstração: importe arquivos reais para exportar".into());
        }
        let path = asset
            .get("path")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if path.is_empty() || !PathBuf::from(&path).exists() {
            return Err(format!("arquivo de mídia não encontrado: {path}"));
        }
        clips.push(RenderClip {
            path,
            start_us: number(clip.get("startUs")),
            in_us: number(clip.get("sourceInUs")),
            out_us: number(clip.get("sourceOutUs")),
            has_audio: number(asset.get("audioChannels")) > 0,
        });
    }
    if clips.is_empty() {
        return Err("nada para exportar: a timeline de vídeo está vazia".into());
    }
    clips.sort_by_key(|c| c.start_us);

    let exports = app_dir(&app, "exports")?;
    let out_path = exports.join(format!("{}.mp4", sanitize_stem(&output_name)));
    if out_path.exists() && !overwrite {
        return Err(format!("o arquivo já existe: {}", out_path.display()));
    }

    let mut args: Vec<String> = vec!["-y".into(), "-hide_banner".into()];
    let mut filters: Vec<String> = Vec::new();
    let mut concat_inputs = String::new();
    let mut input_index = 0usize;

    for clip in &clips {
        let duration = ((clip.out_us - clip.in_us).max(1) as f64) / 1_000_000.0;
        args.push("-ss".into());
        args.push(format!("{:.6}", (clip.in_us as f64) / 1_000_000.0));
        args.push("-t".into());
        args.push(format!("{duration:.6}"));
        args.push("-i".into());
        args.push(clip.path.clone());
        let video_index = input_index;
        input_index += 1;

        let audio_label = if clip.has_audio {
            format!("[{video_index}:a]")
        } else {
            // Silent filler input keeps the concat filter's stream count stable.
            args.push("-f".into());
            args.push("lavfi".into());
            args.push("-t".into());
            args.push(format!("{duration:.6}"));
            args.push("-i".into());
            args.push("anullsrc=channel_layout=stereo:sample_rate=48000".into());
            let silent = input_index;
            input_index += 1;
            format!("[{silent}:a]")
        };

        filters.push(format!(
            "[{video_index}:v]scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v{video_index}]",
            w = preset.width,
            h = preset.height
        ));
        filters.push(format!(
            "{audio_label}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a{video_index}]"
        ));
        concat_inputs.push_str(&format!("[v{video_index}][a{video_index}]"));
    }

    filters.push(format!(
        "{concat_inputs}concat=n={}:v=1:a=1[outv][outa]",
        clips.len()
    ));

    args.push("-filter_complex".into());
    args.push(filters.join(";"));
    args.extend([
        "-map".into(),
        "[outv]".into(),
        "-map".into(),
        "[outa]".into(),
        "-c:v".into(),
        "libx264".into(),
        "-preset".into(),
        "medium".into(),
        "-crf".into(),
        preset.crf.to_string(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        format!("{}k", preset.audio_bitrate_kbps),
        "-movflags".into(),
        "+faststart".into(),
        out_path.to_string_lossy().to_string(),
    ]);

    let output = run(&ffmpeg, &args).map_err(|_| missing_tool("FFmpeg"))?;
    if !output.status.success() {
        let log = String::from_utf8_lossy(&output.stderr).to_string();
        let _ = std::fs::write(app_dir(&app, "logs")?.join("export.log"), &log);
        let tail: Vec<&str> = log.lines().rev().take(4).collect();
        return Err(format!(
            "a exportação falhou: {}",
            tail.into_iter().rev().collect::<Vec<_>>().join(" | ")
        ));
    }
    let bytes = std::fs::metadata(&out_path).map(|m| m.len()).unwrap_or(0);
    Ok(ExportResult {
        output_path: out_path.to_string_lossy().to_string(),
        bytes,
        simulated: false,
    })
}

#[cfg(test)]
mod tests {
    use super::{llm_model_for, origin_allowed, parse_ratio, parse_silencedetect, sanitize_stem};

    #[test]
    fn only_allowlisted_origins_download() {
        assert!(origin_allowed(
            "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/x.zip"
        ));
        assert!(!origin_allowed("http://evil.example.com/ffmpeg.zip"));
    }

    #[test]
    fn reads_fractional_frame_rates() {
        assert_eq!(parse_ratio(Some("30000/1001")), (30000, 1001));
        assert_eq!(parse_ratio(Some("0/0")), (30, 1));
        assert_eq!(parse_ratio(None), (30, 1));
    }

    #[test]
    fn parses_silence_pairs_and_open_tail() {
        let log = "[silencedetect @ 1] silence_start: 1.5\n[silencedetect @ 1] silence_end: 2.75 | silence_duration: 1.25\n[silencedetect @ 1] silence_start: 4.0\n";
        let ranges = parse_silencedetect(log, 6_000_000);
        assert_eq!(ranges.len(), 2);
        assert_eq!(ranges[0].start_us, 1_500_000);
        assert_eq!(ranges[0].end_us, 2_750_000);
        assert_eq!(ranges[1].end_us, 6_000_000);
    }

    #[test]
    fn export_names_are_filesystem_safe() {
        assert_eq!(sanitize_stem("../../evil"), "______evil");
        assert_eq!(sanitize_stem("  "), "export");
    }

    #[test]
    fn light_profile_uses_the_small_script_model() {
        assert!(llm_model_for(Some("light")).1.contains("3B"));
        assert!(llm_model_for(Some("recommended")).1.contains("7B"));
        assert!(llm_model_for(None).1.contains("7B"));
    }

    #[test]
    fn generative_downloads_stay_on_allowed_origins() {
        for url in [
            super::PIPER_ZIP,
            super::SD_ZIP,
            super::SD_MODEL_URL,
            super::LLAMA_ZIP,
            super::PIPER_VOICE_BASE,
            super::QWEN_7B.0,
            super::QWEN_3B.0,
        ] {
            assert!(origin_allowed(url), "origem não permitida: {url}");
        }
    }
}
