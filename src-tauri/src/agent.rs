//! Commands the in-chat assistant needs beyond timeline editing: generating a
//! single still with the local diffusion model, saving a transcript as a file
//! next to the exports, and — when the user asks for it — a web search.
//!
//! The search is the only outbound call in the whole app: it goes to
//! DuckDuckGo's public JSON API, sends nothing but the query, and never carries
//! project data, media or tokens.

use serde::Serialize;

use crate::media::{app_dir, missing_tool, run, sanitize_stem};

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

    // The diffusion model works on multiples of 64; clamp to a sane canvas.
    let width = (width.clamp(256, 1536) / 64) * 64;
    let height = (height.clamp(256, 1536) / 64) * 64;
    let out = app_dir(&app, "exports")?.join(format!("{}.png", sanitize_stem(&output_name)));

    let args: Vec<String> = vec![
        "-M".into(),
        "txt2img".into(),
        "-m".into(),
        model.to_string_lossy().to_string(),
        "-p".into(),
        prompt,
        "-W".into(),
        width.to_string(),
        "-H".into(),
        height.to_string(),
        "--steps".into(),
        "22".into(),
        "-o".into(),
        out.to_string_lossy().to_string(),
    ];
    let output = run(&binary, &args)?;
    if !output.status.success() || !out.exists() {
        let log = String::from_utf8_lossy(&output.stderr).to_string();
        let _ = std::fs::write(app_dir(&app, "logs")?.join("imagens.log"), &log);
        return Err(format!(
            "o gerador de imagens falhou: {} (detalhes em logs/imagens.log)",
            log.lines().last().unwrap_or("sem detalhes")
        ));
    }
    Ok(out.to_string_lossy().to_string())
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

    let args: Vec<String> = vec![
        "--model".into(),
        voice.to_string_lossy().to_string(),
        "--output_file".into(),
        out.to_string_lossy().to_string(),
    ];
    let mut child = crate::media::spawn_piped(&piper, &args)?;
    if let Some(stdin) = child.stdin.as_mut() {
        use std::io::Write;
        stdin.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    }
    drop(child.stdin.take());
    let done = child.wait().map_err(|e| e.to_string())?;
    if !done.success() || !out.exists() {
        return Err("a narração falhou — reinstale a voz na tela de configuração".into());
    }
    Ok(out.to_string_lossy().to_string())
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
