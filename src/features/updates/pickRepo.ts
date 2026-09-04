import type { GithubRepoRef } from "@/core/runtime/types";

/**
 * Scores how likely a repository is to be the one publishing L30 CUT AI
 * installers, so the settings screen can preselect it without the user
 * hunting through a long list.
 */
export function scoreRepo(repo: GithubRepoRef): number {
  const name = repo.fullName.split("/")[1]?.toLowerCase() ?? "";
  let score = 0;
  if (name === "l30cut" || name === "l30-cut-ai") score += 100;
  if (name.includes("l30")) score += 40;
  if (name.includes("cut")) score += 20;
  if (name.includes("ai")) score += 5;
  if (!repo.private) score += 5;
  if (repo.pushedAt) {
    const days = (Date.now() - Date.parse(repo.pushedAt)) / 86_400_000;
    if (Number.isFinite(days)) score += Math.max(0, 10 - days / 30);
  }
  return score;
}

/** Best guess for the update repository, or null when the list is empty. */
export function pickUpdateRepo(repos: GithubRepoRef[]): string | null {
  if (repos.length === 0) return null;
  const ranked = [...repos].sort((a, b) => scoreRepo(b) - scoreRepo(a));
  return ranked[0]?.fullName ?? null;
}

/** Candidates worth probing for an installer release, strongest first. */
export function repoCandidates(repos: GithubRepoRef[], limit = 5): string[] {
  return [...repos]
    .sort((a, b) => scoreRepo(b) - scoreRepo(a))
    .slice(0, limit)
    .map((r) => r.fullName);
}
