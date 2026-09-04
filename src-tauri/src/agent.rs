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
