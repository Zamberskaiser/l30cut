//! Commands the in-chat assistant needs beyond timeline editing: generating a
//! single still with the local diffusion model, saving a transcript as a file
//! next to the exports, and — when the user asks for it — a web search.
//!
//! The search is the only outbound call in the whole app: it goes to
//! DuckDuckGo's public JSON API, sends nothing but the query, and never carries
//! project data, media or tokens.

use serde::Serialize;

use crate::media::{app_dir, missing_tool, run, sanitize_stem};

fn append_log(app: &tauri::AppHandle, name: &str, entry: &str) {
    use std::io::Write;
    if let Ok(dir) = app_dir(app, "logs") {
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join(name))
        {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|value| value.as_secs())
                .unwrap_or(0);
            let _ = writeln!(file, "[{stamp}] {entry}\n");
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

/// Renders one still with stable-diffusion.cpp and returns its path.
#[tauri::command]
pub fn create_ai_image(
    app: tauri::AppHandle,
    prompt: String,
    width: u32,
    height: u32,
    output_name: String,
) -> Result<String, String> {
    let prompt = prompt.trim().to_string();
    if prompt.is_empty() {
        return Err("descreva a imagem que você quer".into());
    }
    let binary = crate::creator::sd_binary(&app).ok_or_else(|| missing_tool("stable-diffusion.cpp"))?;
    let model = crate::creator::sd_model(&app)
        .ok_or_else(|| "nenhum modelo de imagem instalado — abra a configuração e instale o gerador de imagens".to_string())?;

    let out = app_dir(&app, "exports")?.join(format!("{}.png", sanitize_stem(&output_name)));
    match crate::creator::draw_still(&binary, &model, &prompt, width, height, &out) {
        Ok(()) => {
            append_log(
                &app,
                "imagens.log",
                &format!(
                    "SUCESSO\nmodo: {}\nmodelo: {}\nprompt: {prompt}\narquivo: {}",
                    crate::creator::SD_IMAGE_MODE,
                    model.display(),
                    out.display()
                ),
            );
            Ok(out.to_string_lossy().to_string())
        }
        Err(problem) => {
            append_log(
                &app,
                "imagens.log",
                &format!(
                    "FALHA\nmodo: {}\nmodelo: {}\nprompt: {prompt}\nerro: {problem}",
                    crate::creator::SD_IMAGE_MODE,
                    model.display()
                ),
            );
            Err(format!(
                "o gerador de imagens falhou: {problem} (detalhes em logs/imagens.log)"
            ))
        }
    }
}

/// Speaks a text with the local Piper voice and returns the WAV path, so the
/// assistant can hand a real narration file to the project's media bin.
#[tauri::command]
pub fn create_ai_audio(
    app: tauri::AppHandle,
    text: String,
    output_name: String,
) -> Result<String, String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("diga o que a voz deve falar".into());
    }
    let piper = crate::creator::piper_binary(&app).ok_or_else(|| missing_tool("piper"))?;
    let voice = crate::creator::first_file(&app, "voices", "onnx")
        .ok_or_else(|| "nenhuma voz instalada — abra a configuração e instale a narração".to_string())?;
    let out = app_dir(&app, "exports")?.join(format!("{}.wav", sanitize_stem(&output_name)));

    match crate::creator::speak_to_wav(&piper, &voice, &text, &out) {
        Ok(()) => Ok(out.to_string_lossy().to_string()),
        Err(problem) => {
            let _ = std::fs::write(
                app_dir(&app, "logs")?.join("narracao.log"),
                format!("voz: {}\nerro: {problem}\n", voice.display()),
            );
            let _ = std::fs::remove_file(&out);
            Err(format!(
                "a narração falhou: {problem} (detalhes em logs/narracao.log)"
            ))
        }
    }
}

/// Honest per-engine report: is the picture/voice/transcription engine really
/// usable, and if not, what exactly is missing — plus the last lines the engine
/// itself wrote. This is what the "Diagnóstico" screen shows.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineReport {
    pub id: String,
    pub label: String,
    pub ready: bool,
    pub detail: String,
    /// Tail of the engine's own log, when it wrote one.
    pub log: Option<String>,
}

fn tail_log(app: &tauri::AppHandle, name: &str) -> Option<String> {
    let path = app_dir(app, "logs").ok()?.join(name);
    let body = std::fs::read_to_string(path).ok()?;
    let lines: Vec<&str> = body.lines().filter(|l| !l.trim().is_empty()).collect();
    let start = lines.len().saturating_sub(12);
    let tail = lines[start..].join("\n");
    if tail.trim().is_empty() { None } else { Some(tail) }
}

#[tauri::command]
pub fn ai_report(app: tauri::AppHandle) -> Result<Vec<EngineReport>, String> {
    let mut out: Vec<EngineReport> = Vec::new();

    let ffmpeg = crate::media::tool_exists(&app, "ffmpeg");
    out.push(EngineReport {
        id: "ffmpeg".into(),
        label: "Montador de vídeo (FFmpeg)".into(),
        ready: ffmpeg,
        detail: if ffmpeg {
            "pronto".into()
        } else {
            "não encontrado — instale pela tela de Configuração".into()
        },
        log: tail_log(&app, "creator.log"),
    });

    let sd = crate::creator::sd_binary(&app);
    let sd_model = crate::creator::sd_model(&app);
    let detail = match (&sd, &sd_model) {
        (Some(bin), Some(model)) => format!(
            "programa: {} · modelo: {}",
            bin.display(),
            model
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default()
        ),
        (None, _) => "o programa de imagens não está instalado".into(),
        (_, None) => "falta o modelo de imagem (arquivo .safetensors)".into(),
    };
    out.push(EngineReport {
        id: "images".into(),
        label: "Gerador de imagens".into(),
        ready: sd.is_some() && sd_model.is_some(),
        detail,
        log: tail_log(&app, "imagens.log"),
    });

    let piper = crate::creator::piper_binary(&app);
    let voice = crate::creator::first_file(&app, "voices", "onnx");
    let voice_config = voice
        .as_ref()
        .map(|v| std::path::PathBuf::from(format!("{}.json", v.to_string_lossy())))
        .filter(|p| p.is_file());
    let detail = match (&piper, &voice, &voice_config) {
        (Some(_), Some(v), Some(_)) => format!(
            "voz: {}",
            v.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default()
        ),
        (None, _, _) => "o programa de voz (piper) não está instalado".into(),
        (_, None, _) => "nenhuma voz instalada".into(),
        (_, Some(_), None) => {
            "a voz está sem o arquivo de configuração (.onnx.json) — reinstale a narração".into()
        }
    };
    out.push(EngineReport {
        id: "narration".into(),
        label: "Voz / narração".into(),
        ready: piper.is_some() && voice.is_some() && voice_config.is_some(),
        detail,
        log: tail_log(&app, "narracao.log"),
    });

    let whisper = crate::media::bundled_binary(&app, &["whisper-cli", "main", "whisper"]);
    let whisper_model = crate::media::first_asset(&app, "models", &["bin", "gguf"]);
    out.push(EngineReport {
        id: "speech".into(),
        label: "Transcritor de fala".into(),
        ready: whisper.is_some() && whisper_model.is_some(),
        detail: match (&whisper, &whisper_model) {
            (Some(_), Some(m)) => format!(
                "modelo: {}",
                m.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default()
            ),
            (None, _) => "o transcritor não está instalado".into(),
            (_, None) => "falta o modelo de fala".into(),
        },
        log: tail_log(&app, "transcricao.log"),
    });

    out.push(EngineReport {
        id: "creation".into(),
        label: "Última criação de vídeo".into(),
        ready: true,
        detail: match tail_log(&app, "criacao.log") {
            Some(_) => "houve avisos na última criação — veja abaixo".into(),
            None => "sem avisos registrados".into(),
        },
        log: tail_log(&app, "criacao.log"),
    });

    Ok(out)
}

/// Runs the actual image executable with a tiny render. Presence alone is not
/// enough: this catches incompatible CLI modes and broken model/DLL installs.
#[tauri::command]
pub fn test_image_engine(app: tauri::AppHandle) -> Result<EngineReport, String> {
    let binary = crate::creator::sd_binary(&app)
        .ok_or_else(|| missing_tool("stable-diffusion.cpp"))?;
    let model = crate::creator::sd_model(&app)
        .ok_or_else(|| "nenhum modelo de imagem instalado".to_string())?;
    let out = app_dir(&app, "diagnostics")?.join("teste-gerador-imagens.png");
    let result = crate::creator::draw_still(
        &binary,
        &model,
        "a simple orange circle on a plain dark background",
        256,
        256,
        &out,
    );
    match result {
        Ok(()) => {
            append_log(
                &app,
                "imagens.log",
                &format!(
                    "TESTE REAL OK\nmodo: {}\narquivo: {}",
                    crate::creator::SD_IMAGE_MODE,
                    out.display()
                ),
            );
            Ok(EngineReport {
                id: "images".into(),
                label: "Gerador de imagens".into(),
                ready: true,
                detail: format!(
                    "teste real concluído com o modo {}",
                    crate::creator::SD_IMAGE_MODE
                ),
                log: tail_log(&app, "imagens.log"),
            })
        }
        Err(problem) => {
            append_log(
                &app,
                "imagens.log",
                &format!(
                    "TESTE REAL FALHOU\nmodo: {}\nerro: {problem}",
                    crate::creator::SD_IMAGE_MODE
                ),
            );
            Ok(EngineReport {
                id: "images".into(),
                label: "Gerador de imagens".into(),
                ready: false,
                detail: problem,
                log: tail_log(&app, "imagens.log"),
            })
        }
    }
}


/// Writes a text file (transcript, script, notes) into the exports folder.
#[tauri::command]
pub fn save_text_file(
    app: tauri::AppHandle,
    name: String,
    extension: String,
    text: String,
) -> Result<String, String> {
    let ext: String = extension
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(5)
        .collect();
    let ext = if ext.is_empty() { "txt".to_string() } else { ext };
    let path = app_dir(&app, "exports")?.join(format!("{}.{ext}", sanitize_stem(&name)));
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// Saves a still as a PNG with embedded metadata and an automatic file name,
/// preferring the user's Downloads folder so the file is easy to find.
#[tauri::command]
pub fn export_png(
    app: tauri::AppHandle,
    source: String,
    title: String,
    description: Option<String>,
) -> Result<String, String> {
    use tauri::Manager;

    let src = std::path::PathBuf::from(&source);
    if !src.exists() {
        return Err("o arquivo da imagem não está mais no lugar".into());
    }

    // Anything that is not already a PNG goes through ffmpeg for one frame.
    let png_path = if is_png(&src) {
        src.clone()
    } else {
        let ffmpeg = crate::media::tool(&app, "ffmpeg")?;
        let tmp = app_dir(&app, "exports")?.join(format!("{}-tmp.png", sanitize_stem(&title)));
        let args: Vec<String> = vec![
            "-y".into(),
            "-i".into(),
            src.to_string_lossy().to_string(),
            "-frames:v".into(),
            "1".into(),
            tmp.to_string_lossy().to_string(),
        ];
        let output = run(&ffmpeg, &args)?;
        if !output.status.success() || !tmp.exists() {
            return Err("não consegui converter esta mídia em PNG".into());
        }
        tmp
    };

    let bytes = std::fs::read(&png_path).map_err(|e| e.to_string())?;
    let stamp = timestamp_utc();
    let entries = vec![
        ("Title".to_string(), title.trim().to_string()),
        (
            "Description".to_string(),
            description.unwrap_or_default().trim().to_string(),
        ),
        ("Software".to_string(), "L30 CUT AI".to_string()),
        ("Source".to_string(), source.clone()),
        ("Creation Time".to_string(), stamp.readable.clone()),
    ];
    let with_meta = png_with_text(&bytes, &entries)?;

    let dir = app
        .path()
        .download_dir()
        .ok()
        .filter(|d| d.exists())
        .unwrap_or(app_dir(&app, "exports")?);
    let out = dir.join(format!("{}-{}.png", sanitize_stem(&title), stamp.compact));
    std::fs::write(&out, with_meta).map_err(|e| e.to_string())?;
    if png_path != src {
        let _ = std::fs::remove_file(&png_path);
    }
    Ok(out.to_string_lossy().to_string())
}

fn is_png(path: &std::path::Path) -> bool {
    let mut head = [0u8; 8];
    match std::fs::File::open(path) {
        Ok(mut file) => {
            use std::io::Read;
            file.read_exact(&mut head).is_ok() && head == PNG_SIGNATURE
        }
        Err(_) => false,
    }
}

const PNG_SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];

pub struct Stamp {
    pub compact: String,
    pub readable: String,
}

/// Formats "now" as UTC without pulling a date crate in.
pub fn timestamp_utc() -> Stamp {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    format_epoch(secs)
}

/// Civil date from a Unix timestamp (Howard Hinnant's algorithm).
pub fn format_epoch(secs: i64) -> Stamp {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (hour, minute, second) = (rem / 3600, (rem % 3600) / 60, rem % 60);

    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };

    Stamp {
        compact: format!("{year:04}{month:02}{day:02}-{hour:02}{minute:02}{second:02}"),
        readable: format!("{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02} UTC"),
    }
}

/// Inserts tEXt chunks right after IHDR so viewers and tools can read the
/// title, prompt and creation date straight from the file.
pub fn png_with_text(bytes: &[u8], entries: &[(String, String)]) -> Result<Vec<u8>, String> {
    if bytes.len() < 8 + 12 || bytes[..8] != PNG_SIGNATURE {
        return Err("este arquivo não é um PNG válido".into());
    }
    let ihdr_len = u32::from_be_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]) as usize;
    let insert_at = 8 + 12 + ihdr_len;
    if bytes.len() < insert_at {
        return Err("este arquivo não é um PNG válido".into());
    }

    let mut out = Vec::with_capacity(bytes.len() + 256);
    out.extend_from_slice(&bytes[..insert_at]);
    for (key, value) in entries {
        if key.is_empty() || value.is_empty() {
            continue;
        }
        let mut data = Vec::new();
        data.extend_from_slice(key.as_bytes());
        data.push(0);
        data.extend_from_slice(value.replace('\0', " ").as_bytes());
        out.extend_from_slice(&(data.len() as u32).to_be_bytes());
        let mut chunk = b"tEXt".to_vec();
        chunk.extend_from_slice(&data);
        out.extend_from_slice(&chunk);
        out.extend_from_slice(&crc32(&chunk).to_be_bytes());
    }
    out.extend_from_slice(&bytes[insert_at..]);
    Ok(out)
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for byte in data {
        crc ^= *byte as u32;
        for _ in 0..8 {
            crc = if crc & 1 == 1 { (crc >> 1) ^ 0xEDB8_8320 } else { crc >> 1 };
        }
    }
    !crc
}

/// Public web search, used only when the user asks the assistant to look
/// something up. Query text only — no project data leaves the machine.
#[tauri::command]
pub async fn web_search(query: String) -> Result<Vec<SearchHit>, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Err("diga o que devo pesquisar".into());
    }
    let url = format!(
        "https://api.duckduckgo.com/?q={}&format=json&no_html=1&no_redirect=1&skip_disambig=1",
        encode_query(&query)
    );
    let body = reqwest::get(&url)
        .await
        .map_err(|e| format!("não consegui pesquisar na internet: {e}"))?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    let value: serde_json::Value =
        serde_json::from_str(&body).map_err(|_| "a resposta da pesquisa não pôde ser lida".to_string())?;
    Ok(parse_search(&value))
}

/// Percent-encodes the query so any wording is a safe URL (no extra crates).
fn encode_query(query: &str) -> String {
    let mut out = String::new();
    for byte in query.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            b' ' => out.push('+'),
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

/// Turns DuckDuckGo's answer into a flat hit list (abstract first, then topics).
pub fn parse_search(value: &serde_json::Value) -> Vec<SearchHit> {
    let mut hits: Vec<SearchHit> = Vec::new();
    let abstract_text = value["AbstractText"].as_str().unwrap_or("").trim();
    if !abstract_text.is_empty() {
        hits.push(SearchHit {
            title: value["Heading"].as_str().unwrap_or("Resumo").trim().to_string(),
            url: value["AbstractURL"].as_str().unwrap_or("").to_string(),
            snippet: abstract_text.to_string(),
        });
    }
    if let Some(topics) = value["RelatedTopics"].as_array() {
        for topic in topics {
            // Grouped topics nest their entries one level deeper.
            let entries = match topic["Topics"].as_array() {
                Some(inner) => inner.clone(),
                None => vec![topic.clone()],
            };
            for entry in entries {
                let text = entry["Text"].as_str().unwrap_or("").trim().to_string();
                let url = entry["FirstURL"].as_str().unwrap_or("").trim().to_string();
                if text.is_empty() || url.is_empty() {
                    continue;
                }
                let title = text.split(" - ").next().unwrap_or(&text).to_string();
                hits.push(SearchHit { title, url, snippet: text });
                if hits.len() >= 8 {
                    return hits;
                }
            }
        }
    }
    hits
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn abstract_and_topics_become_hits() {
        let value: serde_json::Value = serde_json::from_str(
            r#"{"Heading":"FFmpeg","AbstractText":"Ferramenta de vídeo","AbstractURL":"https://x/y",
                "RelatedTopics":[{"Text":"Codec - descrição","FirstURL":"https://a/b"},
                                 {"Topics":[{"Text":"Filtro - outro","FirstURL":"https://c/d"}]}]}"#,
        )
        .unwrap();
        let hits = parse_search(&value);
        assert_eq!(hits.len(), 3);
        assert_eq!(hits[0].title, "FFmpeg");
        assert_eq!(hits[1].url, "https://a/b");
        assert_eq!(hits[2].title, "Filtro");
    }

    #[test]
    fn queries_are_percent_encoded() {
        assert_eq!(encode_query("como cortar vídeo?"), "como+cortar+v%C3%ADdeo%3F");
    }

    #[test]
    fn empty_answer_yields_no_hits() {
        let value: serde_json::Value = serde_json::from_str("{}").unwrap();
        assert!(parse_search(&value).is_empty());
    }
}
