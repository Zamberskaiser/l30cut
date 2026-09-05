//! Local AI video creator: script (local LLM), narration (Piper TTS),
//! scene images (stable-diffusion.cpp, with a deterministic FFmpeg card as
//! fallback) and a deterministic FFmpeg montage.
//!
//! Everything runs on the user's machine. The only network call is to a local
//! LLM endpoint (loopback only), so nothing leaves the computer.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::media::{app_dir, missing_tool, run, sanitize_stem, tool, tool_exists};

pub const SD_IMAGE_MODE: &str = "img_gen";

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

pub fn piper_binary(app: &tauri::AppHandle) -> Option<PathBuf> {
    let bin = app_dir(app, "bin").ok()?;
    for name in ["piper", "piper-cli"] {
        let path = bin.join(crate::media::exe_name(name));
        if path.exists() {
            return Some(path);
        }
    }
    None
}

pub fn first_file(app: &tauri::AppHandle, sub: &str, ext: &str) -> Option<PathBuf> {
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
pub fn sd_model(app: &tauri::AppHandle) -> Option<PathBuf> {
    crate::media::first_asset(app, "diffusion", &["safetensors", "gguf", "ckpt"])
}

pub fn sd_binary(app: &tauri::AppHandle) -> Option<PathBuf> {
    crate::media::private_component_binary(app, "sd", crate::media::SD_BINARIES)
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
    /// Plain-language reasons an engine did not contribute to this render.
    pub notes: Vec<String>,
}

/// Diffusion models work in multiples of 64 and choke on huge canvases on CPU,
/// so a 1920x1080 sequence renders its stills at a safe size and the montage
/// scales them back up.
pub fn still_size(width: u32, height: u32) -> (u32, u32) {
    let longest = width.max(height).max(1) as f64;
    let scale = (768.0 / longest).min(1.0);
    let fit = |value: u32| -> u32 {
        let scaled = ((value as f64) * scale).round() as u32;
        ((scaled.clamp(256, 1024) + 32) / 64 * 64).clamp(256, 1024)
    };
    (fit(width), fit(height))
}

/// Runs the diffusion model for one still and reports why it failed, if it did.
pub fn draw_still(
    sd: &std::path::Path,
    model: &std::path::Path,
    prompt: &str,
    width: u32,
    height: u32,
    out: &std::path::Path,
) -> Result<(), String> {
    let (w, h) = still_size(width, height);
    let args: Vec<String> = vec![
        "-M".into(),
        SD_IMAGE_MODE.into(),
        "-m".into(),
        model.to_string_lossy().to_string(),
        "-p".into(),
        prompt.to_string(),
        "-W".into(),
        w.to_string(),
        "-H".into(),
        h.to_string(),
        "--steps".into(),
        "20".into(),
        "-o".into(),
        out.to_string_lossy().to_string(),
    ];
    let output = run(sd, &args)?;
    let size = std::fs::metadata(out).map(|m| m.len()).unwrap_or(0);
    if output.status.success() && size > 1_024 {
        return Ok(());
    }
    let log = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout)
    );
    Err(last_meaningful_line(&log)
        .unwrap_or_else(|| "o modelo terminou sem escrever a imagem".into()))
}

/// Speaks a text with Piper, checking the WAV really has sound in it — a Piper
/// missing its `.onnx.json` config writes an empty file and exits with 0.
pub fn speak_to_wav(
    piper: &std::path::Path,
    voice: &std::path::Path,
    text: &str,
    out: &std::path::Path,
) -> Result<(), String> {
    let config = std::path::PathBuf::from(format!("{}.json", voice.to_string_lossy()));
    if !config.is_file() {
        return Err(format!(
            "falta o arquivo de configuração da voz ({}) — reinstale a narração",
            config
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default()
        ));
    }
    let args: Vec<String> = vec![
        "--model".into(),
        voice.to_string_lossy().to_string(),
        "--output_file".into(),
        out.to_string_lossy().to_string(),
    ];
    let mut child = crate::media::spawn_piped(piper, &args)?;
    if let Some(stdin) = child.stdin.as_mut() {
        use std::io::Write;
        let _ = stdin.write_all(text.as_bytes());
    }
    drop(child.stdin.take());
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    let size = std::fs::metadata(out).map(|m| m.len()).unwrap_or(0);
    // 44 bytes is a header with no samples: that is the "silent file" symptom.
    if output.status.success() && size > 2_048 {
        return Ok(());
    }
    let log = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout)
    );
    Err(last_meaningful_line(&log).unwrap_or_else(|| {
        format!("a voz escreveu um arquivo vazio ({size} bytes) — reinstale a narração")
    }))
}

/// Last line of a tool log that actually says something, for error messages.
pub fn last_meaningful_line(log: &str) -> Option<String> {
    log.lines()
        .map(|line| line.trim())
        .filter(|line| line.len() > 3)
        .next_back()
        .map(|line| line.chars().take(200).collect())
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

/// Uses FFmpeg's default font lookup instead of embedding a Windows drive path
/// in the filter expression. A value such as `C:/Windows/...` contains `:`,
/// which has changed escaping behaviour across FFmpeg builds and broke renders.
fn drawtext_filter(title: &str, height: u32) -> Option<String> {
    let text = escape_drawtext(title);
    if text.is_empty() {
        return None;
    }
    Some(format!(
        ",drawtext=text='{text}':fontcolor=white:fontsize={size}:box=1:boxcolor=black@0.45:boxborderw=18:x=(w-text_w)/2:y=h-(h/6)",
        size = (height / 18).max(18)
    ))
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
/// must be launchable and every supplied still must exist and be readable.
/// Failing here gives a clear message instead of an opaque FFmpeg error halfway
/// through the montage.
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

    let mut used_narration = false;
    let mut used_image_model = false;
    let mut parts: Vec<PathBuf> = Vec::new();

    // Why a scene fell back to a card / to silence, so the chat can say it out
    // loud instead of quietly shipping an empty-looking video.
    let mut notes: Vec<String> = Vec::new();
    let mut diary = String::new();

    for (index, scene) in scenes.iter().enumerate() {
        // 1. Narration (Piper) — decides the scene length when available.
        let mut narration_wav: Option<PathBuf> = None;
        let narration_text = scene
            .narration
            .as_ref()
            .map(|t| t.trim().to_string())
            .unwrap_or_default();
        if !narration_text.is_empty() {
            match (piper.as_ref(), voice.as_ref()) {
                (Some(piper), Some(voice)) => {
                    let wav = work.join(format!("voz_{index:03}.wav"));
                    match speak_to_wav(piper, voice, &narration_text, &wav) {
                        Ok(()) => {
                            narration_wav = Some(wav);
                            used_narration = true;
                        }
                        Err(problem) => {
                            diary.push_str(&format!("cena {}: voz falhou -> {problem}\n", index + 1));
                            if notes.iter().all(|n| !n.starts_with("A voz local")) {
                                notes.push(format!("A voz local não gerou som: {problem}"));
                            }
                        }
                    }
                }
                _ => {
                    if options.narrate && notes.iter().all(|n| !n.starts_with("A voz local")) {
                        notes.push(
                            "A voz local não está instalada — instale a narração na tela de Configuração.".into(),
                        );
                    }
                }
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
            match (sd.as_ref(), sd_model.as_ref(), scene.image_prompt.as_ref()) {
                (Some(sd), Some(model), Some(prompt)) => {
                    match draw_still(sd, model, prompt, width, height, &still) {
                        Ok(()) => {
                            image = Some(still.clone());
                            used_image_model = true;
                        }
                        Err(problem) => {
                            diary.push_str(&format!(
                                "cena {}: imagem falhou -> {problem}\n",
                                index + 1
                            ));
                            if notes.iter().all(|n| !n.starts_with("O gerador de imagens")) {
                                notes.push(format!("O gerador de imagens falhou: {problem}"));
                            }
                        }
                    }
                }
                _ => {
                    if notes.iter().all(|n| !n.starts_with("O gerador de imagens")) {
                        notes.push(
                            "O gerador de imagens não está instalado — instale-o na tela de Configuração.".into(),
                        );
                    }
                }
            }
        }


        let mut args: Vec<String> = vec!["-y".into(), "-hide_banner".into()];
        let mut filter = String::new();
        match image.as_ref() {
            Some(path) => {
                // A single still frame feeds zoompan, which then GENERATES the
                // whole movement (`d` frames at `fps`). Looping the input first
                // made zoompan restart on every input frame, so the output only
                // ever showed the first, motionless frame of the move.
                args.extend(["-i".into(), path.to_string_lossy().to_string()]);
                filter.push_str(&format!(
                    "[0:v]scale={big_w}:{big_h}:force_original_aspect_ratio=increase,crop={big_w}:{big_h},zoompan=z='min(zoom+{step:.5},1.18)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:fps=25:s={width}x{height},setsar=1",
                    big_w = width * 2,
                    big_h = height * 2,
                    frames = (duration * 25.0).round().max(2.0) as i64,
                    step = (0.18f64 / (duration * 25.0).max(2.0)).clamp(0.0004, 0.01),
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
            if let Some(title) = scene.title.as_ref() {
                if let Some(title_filter) = drawtext_filter(title, height) {
                    filter.push_str(&title_filter);
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

    // A written trail of what each engine did, so the Diagnóstico screen can
    // show why a render came out as plain cards or without voice.
    if !diary.is_empty() {
        let _ = std::fs::write(app_dir(&app, "logs")?.join("criacao.log"), &diary);
    }

    Ok(CreatorResult {
        output_path: out_path.to_string_lossy().to_string(),
        bytes: std::fs::metadata(&out_path).map(|m| m.len()).unwrap_or(0),
        used_narration,
        used_image_model,
        scene_count: scenes.len(),
        notes,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        drawtext_filter, escape_drawtext, hex_to_ffmpeg_color, is_local_endpoint,
        last_meaningful_line, still_size,
    };

    #[test]
    fn stills_are_multiples_of_64_and_never_huge() {
        let (w, h) = still_size(1920, 1080);
        assert_eq!(w % 64, 0);
        assert_eq!(h % 64, 0);
        assert!(w <= 1024 && h <= 1024);
        assert_eq!(still_size(1080, 1920).0 % 64, 0);
    }

    #[test]
    fn the_last_useful_log_line_is_reported() {
        assert_eq!(
            last_meaningful_line("carregando\nerro: modelo invalido\n\n"),
            Some("erro: modelo invalido".to_string())
        );
        assert_eq!(last_meaningful_line("   \n"), None);
    }

    #[test]
    fn installed_sd_cli_uses_the_supported_image_mode() {
        assert_eq!(super::SD_IMAGE_MODE, "img_gen");
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

    #[test]
    fn drawtext_never_embeds_a_windows_font_path() {
        let filter = drawtext_filter("Person walking on the beach", 1080).unwrap_or_default();
        assert!(filter.starts_with(",drawtext=text='Person walking on the beach'"));
        assert!(!filter.contains("fontfile="));
        assert!(!filter.contains("C:/"));
    }
}
