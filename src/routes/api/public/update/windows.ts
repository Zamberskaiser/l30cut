import { createFileRoute } from "@tanstack/react-router";

/**
 * Endpoint de atualizacao para o tauri-plugin-updater (Windows x64).
 *
 * O app desktop consulta esta URL; ela le a ultima release publica do
 * repositorio GitHub configurado e devolve o manifesto no formato v2:
 *
 *   { version, notes, pub_date, platforms: { "windows-x86_64": { signature, url } } }
 *
 * Sem release nova (ou repositorio nao configurado) devolve 204, que o
 * plugin interpreta como "nenhuma atualizacao disponivel".
 */

const DEFAULT_REPO = "l30cut/l30-cut-ai";

function repoSlug(): string {
  const raw = process.env["UPDATE_GITHUB_REPO"] ?? DEFAULT_REPO;
  return raw.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, "");
}

type GithubAsset = { name: string; browser_download_url: string };
type GithubRelease = {
  tag_name?: string;
  name?: string;
  body?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GithubAsset[];
};

function cleanVersion(tag: string): string {
  return tag.trim().replace(/^v/i, "");
}

function compare(a: string, b: string): number {
  const pa = a.split(/[.\-+]/).map((p) => Number.parseInt(p, 10) || 0);
  const pb = b.split(/[.\-+]/).map((p) => Number.parseInt(p, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}

export const Route = createFileRoute("/api/public/update/windows")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const slug = repoSlug();
        if (!slug || slug.includes("OWNER") || !slug.includes("/")) {
          return new Response(null, { status: 204 });
        }

        const current = new URL(request.url).searchParams.get("current") ?? "0.0.0";

        const headers: Record<string, string> = {
          accept: "application/vnd.github+json",
          "user-agent": "l30-cut-ai-updater",
        };
        const token = process.env["GITHUB_API_KEY"];
        if (token) headers["authorization"] = `Bearer ${token}`;

        const res = await fetch(`https://api.github.com/repos/${slug}/releases/latest`, { headers });
        if (!res.ok) {
          const body = await res.text();
          console.error(`GitHub releases falhou [${res.status}]: ${body}`);
          return new Response(null, { status: 204 });
        }

        const release = (await res.json()) as GithubRelease;
        if (release.draft) return new Response(null, { status: 204 });

        const version = cleanVersion(release.tag_name ?? release.name ?? "");
        if (!version) return new Response(null, { status: 204 });
        if (compare(version, cleanVersion(current)) <= 0) {
          return new Response(null, { status: 204 });
        }

        const assets = release.assets ?? [];
        const installer = assets.find((a) => /(-setup\.exe|\.msi)(\.zip)?$/i.test(a.name) && !a.name.endsWith(".sig"));
        const sigAsset = assets.find((a) => installer && a.name === `${installer.name}.sig`);
        if (!installer || !sigAsset) {
          console.error("Release sem instalador ou sem arquivo .sig correspondente");
          return new Response(null, { status: 204 });
        }

        const sigRes = await fetch(sigAsset.browser_download_url, {
          headers: { "user-agent": "l30-cut-ai-updater" },
        });
        if (!sigRes.ok) {
          console.error(`Falha ao ler assinatura [${sigRes.status}]`);
          return new Response(null, { status: 204 });
        }
        const signature = (await sigRes.text()).trim();

        return new Response(
          JSON.stringify({
            version,
            notes: release.body?.trim() || `Atualizacao ${version} do L30 CUT AI.`,
            pub_date: release.published_at ?? new Date().toISOString(),
            platforms: {
              "windows-x86_64": {
                signature,
                url: installer.browser_download_url,
              },
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
            },
          },
        );
      },
    },
  },
});
