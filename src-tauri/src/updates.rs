//! GitHub account + repository settings for the in-app updater.
//!
//! The user connects their GitHub account with a token (classic or
//! fine-grained) inside the app. The token and the chosen repository are
//! stored ONLY in the app data directory of this machine; nothing is sent
//! anywhere except to api.github.com and to the app's own update endpoint.

use serde::{Deserialize, Serialize};

const UA: &str = "l30-cut-ai-updater";

#[derive(Debug, Default, Serialize, Deserialize)]
struct StoredSettings {
    #[serde(default)]
    token: Option<String>,
    #[serde(default)]
    repo: Option<String>,
    #[serde(default)]
    login: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    avatar_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct GithubAccount {
    pub login: String,
    pub name: Option<String>,
    #[serde(rename = "avatarUrl")]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UpdateSettings {
    pub connected: bool,
    pub repo: Option<String>,
    pub account: Option<GithubAccount>,
}

#[derive(Debug, Serialize)]
pub struct GithubRepo {
    #[serde(rename = "fullName")]
    pub full_name: String,
    pub private: bool,
    #[serde(rename = "pushedAt")]
    pub pushed_at: Option<String>,
}

/// Accepts only `owner/name` shaped slugs so a stored value can never turn
/// into an arbitrary URL or query string on the update endpoint.
pub fn normalize_repo(raw: &str) -> Option<String> {
    let trimmed = raw
        .trim()
        .trim_start_matches("https://github.com/")
        .trim_start_matches("http://github.com/")
        .trim_end_matches('/')
        .trim_end_matches(".git");
    let mut parts = trimmed.split('/');
    let owner = parts.next()?;
    let name = parts.next()?;
    if parts.next().is_some() || owner.is_empty() || name.is_empty() {
        return None;
    }
    let ok = |s: &str| {
        s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    };
    if !ok(owner) || !ok(name) {
        return None;
    }
    Some(format!("{owner}/{name}"))
}

fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let base = tauri::Manager::path(app)
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    Ok(base.join("update-settings.json"))
}

fn read_settings(app: &tauri::AppHandle) -> StoredSettings {
    let Ok(path) = settings_path(app) else {
        return StoredSettings::default();
    };
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<StoredSettings>(&raw).ok())
        .unwrap_or_default()
}

fn write_settings(app: &tauri::AppHandle, settings: &StoredSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

fn public(settings: &StoredSettings) -> UpdateSettings {
    UpdateSettings {
        connected: settings.token.is_some(),
        repo: settings.repo.clone(),
        account: settings.login.as_ref().map(|login| GithubAccount {
            login: login.clone(),
            name: settings.name.clone(),
            avatar_url: settings.avatar_url.clone(),
        }),
    }
}

async fn github_get(token: &str, path: &str) -> Result<serde_json::Value, String> {
    let res = reqwest::Client::new()
        .get(format!("https://api.github.com{path}"))
        .header("accept", "application/vnd.github+json")
        .header("user-agent", UA)
        .header("authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| format!("falha de rede ao falar com o GitHub: {e}"))?;
    let status = res.status();
    let body = res.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("GitHub respondeu {status}: {body}"));
    }
    serde_json::from_str(&body).map_err(|e| e.to_string())
}

/// Saved account + repository, without ever exposing the token.
#[tauri::command]
pub fn update_settings(app: tauri::AppHandle) -> UpdateSettings {
    public(&read_settings(&app))
}

/// Validates the token against GitHub and stores it locally.
#[tauri::command]
pub async fn github_connect(app: tauri::AppHandle, token: String) -> Result<UpdateSettings, String> {
    let token = token.trim().to_string();
    if token.is_empty() {
        return Err("informe o token do GitHub".into());
    }
    let user = github_get(&token, "/user").await?;
    let login = user
        .get("login")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "GitHub não devolveu o usuário".to_string())?
        .to_string();

    let mut settings = read_settings(&app);
    settings.token = Some(token);
    settings.login = Some(login);
    settings.name = user
        .get("name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    settings.avatar_url = user
        .get("avatar_url")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    write_settings(&app, &settings)?;
    Ok(public(&settings))
}

/// Repositories the connected account can administer, newest activity first.
#[tauri::command]
pub async fn github_repos(app: tauri::AppHandle) -> Result<Vec<GithubRepo>, String> {
    let settings = read_settings(&app);
    let token = settings
        .token
        .ok_or_else(|| "conecte sua conta do GitHub primeiro".to_string())?;
    let value = github_get(
        &token,
        "/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member",
    )
    .await?;
    let list = value.as_array().cloned().unwrap_or_default();
    Ok(list
        .into_iter()
        .filter_map(|item| {
            Some(GithubRepo {
                full_name: item.get("full_name")?.as_str()?.to_string(),
                private: item
                    .get("private")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false),
                pushed_at: item
                    .get("pushed_at")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            })
        })
        .collect())
}

/// True when the repository already publishes a release with a Windows
/// installer, which is what the updater needs.
#[tauri::command]
pub async fn github_repo_has_release(app: tauri::AppHandle, repo: String) -> Result<bool, String> {
    let slug = normalize_repo(&repo).ok_or_else(|| "repositório inválido".to_string())?;
    let settings = read_settings(&app);
    let token = settings
        .token
        .ok_or_else(|| "conecte sua conta do GitHub primeiro".to_string())?;
    match github_get(&token, &format!("/repos/{slug}/releases/latest")).await {
        Ok(release) => {
            let assets = release
                .get("assets")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            Ok(assets.iter().any(|asset| {
                asset
                    .get("name")
                    .and_then(|v| v.as_str())
                    .map(|name| {
                        let lower = name.to_lowercase();
                        (lower.ends_with("-setup.exe") || lower.ends_with(".msi"))
                            || lower.ends_with(".msi.zip")
                    })
                    .unwrap_or(false)
            }))
        }
        Err(_) => Ok(false),
    }
}

/// Stores the repository the updater should watch.
#[tauri::command]
pub fn set_update_repo(app: tauri::AppHandle, repo: String) -> Result<UpdateSettings, String> {
    let slug = normalize_repo(&repo).ok_or_else(|| "repositório inválido".to_string())?;
    let mut settings = read_settings(&app);
    settings.repo = Some(slug);
    write_settings(&app, &settings)?;
    Ok(public(&settings))
}

/// Forgets the token, the account and the repository on this machine.
#[tauri::command]
pub fn github_disconnect(app: tauri::AppHandle) -> Result<UpdateSettings, String> {
    let settings = StoredSettings::default();
    write_settings(&app, &settings)?;
    Ok(public(&settings))
}

/// Update endpoint for the configured repository, if any.
pub fn endpoint_for(app: &tauri::AppHandle, current_version: &str) -> Option<String> {
    let settings = read_settings(app);
    let repo = settings.repo?;
    Some(format!(
        "https://l30cut.lovable.app/api/public/update/windows?current={current_version}&repo={repo}"
    ))
}

#[cfg(test)]
mod tests {
    use super::normalize_repo;

    #[test]
    fn accepts_plain_slug_and_url() {
        assert_eq!(
            normalize_repo(" Zamberskaiser/l30cut "),
            Some("Zamberskaiser/l30cut".into())
        );
        assert_eq!(
            normalize_repo("https://github.com/Zamberskaiser/l30cut.git"),
            Some("Zamberskaiser/l30cut".into())
        );
    }

    #[test]
    fn rejects_injection_shapes() {
        assert_eq!(normalize_repo("owner/name?x=1"), None);
        assert_eq!(normalize_repo("owner/name/extra"), None);
        assert_eq!(normalize_repo("owner"), None);
        assert_eq!(normalize_repo(""), None);
    }
}
