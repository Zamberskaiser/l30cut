//! Local AI video creator: script (local LLM), narration (Piper TTS),
//! scene images (stable-diffusion.cpp, with a deterministic FFmpeg card as
//! fallback) and a deterministic FFmpeg montage.
//!
//! Everything runs on the user's machine. The only network call is to a local
//! LLM endpoint (loopback only), so nothing leaves the computer.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::media::{app_dir, missing_tool, run, sanitize_stem, tool, tool_exists};

/// Engines the creator can use, so the UI can be honest about what is missing.
#[derive(Serialize)]
pub struct CreatorEngines {
    pub ffmpeg: bool,
    /// Piper TTS binary + at least one voice model.
    pub narration: bool,
    /// stable-diffusion.cpp binary + at least one model.
    pub images: bool,
    /// Local OpenAI-compatible endpoint answered (checked on demand).
    pub llm: bool,
}

fn piper_binary(app: &tauri::AppHandle) -> Option<PathBuf> {
    let bin = app_dir(app, "bin").ok()?;
    for name in ["piper", "piper-cli"] {
        let path = bin.join(crate::media::exe_name(name));
        if path.exists() {
            return Some(path);
        }
    }
    None
}

fn first_file(app: &tauri::AppHandle, sub: &str, ext: &str) -> Option<PathBuf> {
    let dir = app_dir(app, sub).ok()?;
    let mut found: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.extension()
                .map(|e| e.eq_ignore_ascii_case(ext))
                .unwrap_or(false)
        })
        .collect();
    found.sort();
    found.into_iter().next()
}

/// Diffusion checkpoint: sd.cpp reads safetensors, gguf and ckpt alike.
fn sd_model(app: &tauri::AppHandle) -> Option<PathBuf> {
    crate::media::first_asset(app, "diffusion", &["safetensors", "gguf", "ckpt"])
}

fn sd_binary(app: &tauri::AppHandle) -> Option<PathBuf> {
    let bin = app_dir(app, "bin").ok()?;
    for name in ["sd", "stable-diffusion"] {
        let path = bin.join(crate::media::exe_name(name));
        if path.exists() {
            return Some(path);
        }
    }
    None
}

#[tauri::command]
pub fn list_ai_engines(app: tauri::AppHandle) -> Result<CreatorEngines, String> {
    Ok(CreatorEngines {
        ffmpeg: tool_exists(&app, "ffmpeg"),
        narration: piper_binary(&app).is_some() && first_file(&app, "voices", "onnx").is_some(),
        images: sd_binary(&app).is_some() && sd_model(&app).is_some(),
        llm: crate::media::bundled_binary(&app, &["llama-server"]).is_some(),
    })
}

/* ------------------------------- local LLM ------------------------------- */

/// Only loopback endpoints are accepted: the script generator must stay local.
pub fn is_local_endpoint(endpoint: &str) -> bool {
    let lowered = endpoint.to_lowercase();
    ["http://127.0.0.1", "http://localhost", "http://[::1]"]
        .iter()
        .any(|prefix| lowered.starts_with(prefix))
}

/// Sends a single prompt to a local OpenAI-compatible server
/// (Ollama, llama.cpp server, LM Studio) and returns the raw text answer.
#[tauri::command]
pub async fn llm_generate(
    endpoint: String,
    model: String,
    prompt: String,
) -> Result<String, String> {
    if !is_local_endpoint(&endpoint) {
        return Err("apenas endpoints locais (127.0.0.1 / localhost) são aceitos".into());
    }
    let url = format!("{}/chat/completions", endpoint.trim_end_matches('/'));
    let body = serde_json::json!({
        "model": model,
        "stream": false,
        "messages": [
            { "role": "system", "content": "Você é um roteirista de vídeos curtos. Responda apenas com JSON válido." },
            { "role": "user", "content": prompt }
        ]
    });
    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("não foi possível falar com o LLM local em {endpoint}: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("o LLM local respondeu {}", response.status()));
    }
    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    json.get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "resposta do LLM local em formato inesperado".to_string())
}

/* ------------------------------ video creator ------------------------------ */

#[derive(Deserialize)]
pub struct SceneInput {
    /// On-screen title/caption for the scene (optional).
    pub title: Option<String>,
    /// Narration text; empty means a silent scene.
    pub narration: Option<String>,
    /// Prompt for the image generator, when no `imagePath` is supplied.
    #[serde(rename = "imagePrompt")]
    pub image_prompt: Option<String>,
    /// Existing image/still on disk to use for this scene.
    #[serde(rename = "imagePath")]
    pub image_path: Option<String>,
    /// Fallback duration when there is no narration audio to measure.
    #[serde(rename = "durationUs")]
    pub duration_us: i64,
    /// Background color of the generated card (`#RRGGBB`).
    pub color: Option<String>,
}

#[derive(Deserialize)]
pub struct CreatorOptions {
    pub width: u32,
    pub height: u32,
    #[serde(rename = "outputName")]
    pub output_name: String,
    /// Generate narration with Piper when it is installed.
    pub narrate: bool,
    /// Burn the scene titles into the picture.
    #[serde(rename = "burnTitles")]
    pub burn_titles: bool,
}

#[derive(Serialize)]
pub struct CreatorResult {
    #[serde(rename = "outputPath")]
    pub output_path: String,
    pub bytes: u64,
    /// Which engines actually produced this render.
    #[serde(rename = "usedNarration")]
    pub used_narration: bool,
    #[serde(rename = "usedImageModel")]
    pub used_image_model: bool,
    #[serde(rename = "sceneCount")]
    pub scene_count: usize,
}

fn hex_to_ffmpeg_color(raw: Option<&String>) -> String {
    let value = raw.map(|s| s.trim().to_string()).unwrap_or_default();
    let hex = value.trim_start_matches('#');
    if hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
        format!("0x{hex}")
    } else {
        "0x101828".into()
    }
}

/// FFmpeg drawtext is picky: strip the characters that break its expression parser.
pub fn escape_drawtext(text: &str) -> String {
    text.chars()
        .filter(|c| !matches!(c, '\'' | ':' | '\\' | '%' | '{' | '}'))
        .collect::<String>()
        .trim()
        .chars()
        .take(90)
        .collect()
}

/// FFmpeg filter arguments treat `:` and `\` as syntax, so a Windows font path
/// like `C:/Windows/Fonts/segoeui.ttf` must be escaped before it reaches
/// `drawtext=fontfile=...`, otherwise every scene fails to render.
pub fn escape_filter_path(path: &str) -> String {
    path.replace('\\', "/").replace(':', "\\:")
}

/// True when an already-escaped path is safe inside an FFmpeg filter argument:
/// every `:` must be escaped and no raw backslash separators may remain.
pub fn filter_path_is_safe(escaped: &str) -> bool {
    if escaped.is_empty() {
        return false;
    }
    let bytes: Vec<char> = escaped.chars().collect();
    for (index, ch) in bytes.iter().enumerate() {
        if *ch == ':' && (index == 0 || bytes[index - 1] != '\\') {
            return false;
        }
        if *ch == '\\' && bytes.get(index + 1) != Some(&':') {
            return false;
        }
        if *ch == '\'' {
            return false;
        }
    }
    true
}

fn caption_font() -> Option<String> {
    for candidate in [
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ] {
        if std::path::Path::new(candidate).exists() {
            return Some(candidate.to_string());
        }
    }
    None
}

fn wav_duration_us(app: &tauri::AppHandle, wav: &std::path::Path) -> Option<i64> {
    let ffprobe = tool(app, "ffprobe").ok()?;
    let args: Vec<String> = vec![
        "-v".into(),
        "error".into(),
        "-show_entries".into(),
        "format=duration".into(),
        "-of".into(),
        "csv=p=0".into(),
        wav.to_string_lossy().to_string(),
    ];
    let output = run(&ffprobe, &args).ok()?;
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    text.parse::<f64>()
        .ok()
        .map(|s| (s * 1_000_000.0).round() as i64)
}

/// Pre-flight check that runs before a single frame is rendered: FFmpeg/ffprobe
/// must be launchable, every supplied still must exist and be readable, and the
/// caption font path must survive FFmpeg's filter escaping. Failing here gives a
/// clear message instead of an opaque FFmpeg error halfway through the montage.
pub fn preflight_render(
    app: &tauri::AppHandle,
    scenes: &[SceneInput],
    options: &CreatorOptions,
) -> Result<(), String> {
    let mut problems: Vec<String> = Vec::new();

    if !tool_exists(app, "ffmpeg") {
        problems.push("FFmpeg não foi encontrado (instale pela tela de Configuração)".into());
    }
    if !tool_exists(app, "ffprobe") {
        problems.push("ffprobe não foi encontrado (instale pela tela de Configuração)".into());
    }

    for (index, scene) in scenes.iter().enumerate() {
        let Some(raw) = scene.image_path.as_ref().map(|s| s.trim().to_string()) else {
            continue;
        };
        if raw.is_empty() {
            continue;
        }
        let path = PathBuf::from(&raw);
        if !path.is_file() {
            problems.push(format!("cena {}: imagem não encontrada em {raw}", index + 1));
            continue;
        }
        if std::fs::File::open(&path).is_err() {
            problems.push(format!("cena {}: imagem sem permissão de leitura ({raw})", index + 1));
        }
    }

    if options.burn_titles {
        match caption_font() {
            Some(font) => {
                if !std::path::Path::new(&font).is_file() {
                    problems.push(format!("fonte de títulos ilegível: {font}"));
                } else if !filter_path_is_safe(&escape_filter_path(&font)) {
                    problems.push(format!("caminho da fonte inválido para o FFmpeg: {font}"));
                }
            }
            None => problems.push(
                "nenhuma fonte de sistema encontrada para escrever os títulos — desligue \"Escrever títulos\"".into(),
            ),
        }
    }

    if problems.is_empty() {
        Ok(())
    } else {
        Err(format!("não é possível renderizar ainda: {}", problems.join("; ")))
    }
}

/// Renders a script into a real MP4: one still per scene with a slow Ken Burns
/// move, optional local narration and optional burned-in titles, concatenated
/// deterministically. Works on any machine; the image and voice models only
/// improve the result when installed.
#[tauri::command]
pub fn create_ai_video(
    app: tauri::AppHandle,
    scenes: Vec<SceneInput>,
    options: CreatorOptions,
) -> Result<CreatorResult, String> {
    if scenes.is_empty() {
        return Err("nenhuma cena para montar".into());
    }
    preflight_render(&app, &scenes, &options)?;
    let ffmpeg = tool(&app, "ffmpeg")?;
    let work = app_dir(&app, "cache")?.join(format!("creator-{}", sanitize_stem(&options.output_name)));
    let _ = std::fs::remove_dir_all(&work);
    std::fs::create_dir_all(&work).map_err(|e| e.to_string())?;

    let width = options.width.clamp(256, 3840);
    let height = options.height.clamp(256, 2160);
    let piper = if options.narrate { piper_binary(&app) } else { None };
    let voice = first_file(&app, "voices", "onnx");
    let sd = sd_binary(&app);
    let sd_model = sd_model(&app);
    let font = caption_font();

    let mut used_narration = false;
    let mut used_image_model = false;
    let mut parts: Vec<PathBuf> = Vec::new();

    for (index, scene) in scenes.iter().enumerate() {
        // 1. Narration (Piper) — decides the scene length when available.
        let mut narration_wav: Option<PathBuf> = None;
        let narration_text = scene
            .narration
            .as_ref()
            .map(|t| t.trim().to_string())
            .unwrap_or_default();
        if let (Some(piper), Some(voice), false) =
            (piper.as_ref(), voice.as_ref(), narration_text.is_empty())
        {
            let wav = work.join(format!("voz_{index:03}.wav"));
            let args: Vec<String> = vec![
                "--model".into(),
                voice.to_string_lossy().to_string(),
                "--output_file".into(),
                wav.to_string_lossy().to_string(),
            ];
            let mut child = crate::media::spawn_piped(piper, &args)?;
            if let Some(stdin) = child.stdin.as_mut() {
                use std::io::Write;
                let _ = stdin.write_all(narration_text.as_bytes());
            }
            drop(child.stdin.take());
            let done = child.wait().map_err(|e| e.to_string())?;
            if done.success() && wav.exists() {
                narration_wav = Some(wav);
                used_narration = true;
            }
        }

        let duration_us = narration_wav
            .as_ref()
            .and_then(|wav| wav_duration_us(&app, wav))
            .unwrap_or(scene.duration_us)
            .clamp(1_000_000, 60_000_000);
        let duration = (duration_us as f64) / 1_000_000.0;

        // 2. Scene picture: existing still, local diffusion model, or a card.
        let still = work.join(format!("cena_{index:03}.png"));
        let mut image: Option<PathBuf> = scene
            .image_path
            .as_ref()
            .map(PathBuf::from)
            .filter(|p| p.exists());
        if image.is_none() {
            if let (Some(sd), Some(model), Some(prompt)) =
                (sd.as_ref(), sd_model.as_ref(), scene.image_prompt.as_ref())
            {
                let args: Vec<String> = vec![
                    "-m".into(),
                    model.to_string_lossy().to_string(),
                    "-p".into(),
                    prompt.clone(),
                    "-W".into(),
                    width.to_string(),
                    "-H".into(),
                    height.to_string(),
                    "-o".into(),
                    still.to_string_lossy().to_string(),
                ];
                if run(sd, &args).map(|o| o.status.success()).unwrap_or(false) && still.exists() {
                    image = Some(still.clone());
                    used_image_model = true;
                }
            }
        }

        let mut args: Vec<String> = vec!["-y".into(), "-hide_banner".into()];
        let mut filter = String::new();
        match image.as_ref() {
            Some(path) => {
                args.extend([
                    "-loop".into(),
                    "1".into(),
                    "-t".into(),
                    format!("{duration:.3}"),
                    "-i".into(),
                    path.to_string_lossy().to_string(),
                ]);
                filter.push_str(&format!(
                    "[0:v]scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},zoompan=z='min(zoom+0.0006,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={width}x{height},fps=25,setsar=1",
                    frames = (duration * 25.0).round().max(1.0) as i64
                ));
            }
            None => {
                // Deterministic color card: the creator works with FFmpeg alone.
                args.extend([
                    "-f".into(),
                    "lavfi".into(),
                    "-t".into(),
                    format!("{duration:.3}"),
                    "-i".into(),
                    format!(
                        "color=c={}:s={width}x{height}:r=25",
                        hex_to_ffmpeg_color(scene.color.as_ref())
                    ),
                ]);
                filter.push_str("[0:v]setsar=1");
            }
        }

        // 3. Titles burned into the picture.
        if options.burn_titles {
            if let (Some(font), Some(title)) = (font.as_ref(), scene.title.as_ref()) {
                let text = escape_drawtext(title);
                let font = escape_filter_path(font);
                if !text.is_empty() {
                    filter.push_str(&format!(
                        ",drawtext=fontfile='{font}':text='{text}':fontcolor=white:fontsize={size}:box=1:boxcolor=black@0.45:boxborderw=18:x=(w-text_w)/2:y=h-(h/6)",
                        size = (height / 18).max(18)
                    ));
                }
            }
        }
        filter.push_str("[v]");

        let audio_index = 1;
        match narration_wav.as_ref() {
            Some(wav) => args.extend(["-i".into(), wav.to_string_lossy().to_string()]),
            None => args.extend([
                "-f".into(),
                "lavfi".into(),
                "-t".into(),
                format!("{duration:.3}"),
                "-i".into(),
                "anullsrc=channel_layout=stereo:sample_rate=48000".into(),
            ]),
        }

        let part = work.join(format!("parte_{index:03}.mp4"));
        args.extend([
            "-filter_complex".into(),
            filter,
            "-map".into(),
            "[v]".into(),
            "-map".into(),
            format!("{audio_index}:a"),
            "-t".into(),
            format!("{duration:.3}"),
            "-c:v".into(),
            "libx264".into(),
            "-preset".into(),
            "medium".into(),
            "-crf".into(),
            "20".into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
            "-c:a".into(),
            "aac".into(),
            "-ar".into(),
            "48000".into(),
            "-ac".into(),
            "2".into(),
            part.to_string_lossy().to_string(),
        ]);

        let output = run(&ffmpeg, &args).map_err(|_| missing_tool("FFmpeg"))?;
        if !output.status.success() {
            let log = String::from_utf8_lossy(&output.stderr).to_string();
            let _ = std::fs::write(app_dir(&app, "logs")?.join("creator.log"), &log);
            return Err(format!(
                "falha ao montar a cena {}: {} (detalhes em logs/creator.log)",
                index + 1,
                log.lines().last().unwrap_or("")
            ));
        }
        parts.push(part);
    }

    // 4. Concatenate the scenes (same codec/params, so a stream copy is enough).
    let list = work.join("cenas.txt");
    let body = parts
        .iter()
        .map(|p| format!("file '{}'", p.to_string_lossy().replace('\'', "")))
        .collect::<Vec<_>>()
        .join("\n");
    std::fs::write(&list, body).map_err(|e| e.to_string())?;

    let out_path = app_dir(&app, "exports")?.join(format!("{}.mp4", sanitize_stem(&options.output_name)));
    let concat_args: Vec<String> = vec![
        "-y".into(),
        "-hide_banner".into(),
        "-f".into(),
        "concat".into(),
        "-safe".into(),
        "0".into(),
        "-i".into(),
        list.to_string_lossy().to_string(),
        "-c".into(),
        "copy".into(),
        "-movflags".into(),
        "+faststart".into(),
        out_path.to_string_lossy().to_string(),
    ];
    let joined = run(&ffmpeg, &concat_args).map_err(|_| missing_tool("FFmpeg"))?;
    if !joined.status.success() {
        return Err(format!(
            "falha ao juntar as cenas: {}",
            String::from_utf8_lossy(&joined.stderr)
                .lines()
                .last()
                .unwrap_or("")
        ));
    }

    Ok(CreatorResult {
        output_path: out_path.to_string_lossy().to_string(),
        bytes: std::fs::metadata(&out_path).map(|m| m.len()).unwrap_or(0),
        used_narration,
        used_image_model,
        scene_count: scenes.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::{
        escape_drawtext, escape_filter_path, filter_path_is_safe, hex_to_ffmpeg_color,
        is_local_endpoint,
    };

    #[test]
    fn escaped_paths_are_accepted_and_raw_ones_rejected() {
        assert!(filter_path_is_safe(&escape_filter_path("C:/Windows/Fonts/arial.ttf")));
        assert!(!filter_path_is_safe("C:/Windows/Fonts/arial.ttf"));
        assert!(!filter_path_is_safe("C:\\Windows\\Fonts\\arial.ttf"));
        assert!(!filter_path_is_safe(""));
    }

    #[test]
    fn windows_font_path_is_escaped_for_ffmpeg() {
        assert_eq!(
            escape_filter_path("C:\\Windows\\Fonts\\segoeui.ttf"),
            "C\\:/Windows/Fonts/segoeui.ttf"
        );
    }

    #[test]
    fn only_loopback_llm_endpoints() {
        assert!(is_local_endpoint("http://127.0.0.1:11434/v1"));
        assert!(is_local_endpoint("http://localhost:8080/v1"));
        assert!(!is_local_endpoint("https://api.openai.com/v1"));
    }

    #[test]
    fn colors_fall_back_to_the_theme_background() {
        assert_eq!(hex_to_ffmpeg_color(Some(&"#1F2937".to_string())), "0x1F2937");
        assert_eq!(hex_to_ffmpeg_color(Some(&"rm -rf".to_string())), "0x101828");
        assert_eq!(hex_to_ffmpeg_color(None), "0x101828");
    }

    #[test]
    fn drawtext_is_sanitized() {
        assert_eq!(escape_drawtext("Cena 1: 'teste'\\"), "Cena 1 teste");
    }
}
