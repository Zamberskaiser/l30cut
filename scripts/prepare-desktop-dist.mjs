// Garante que o HTML estatico exista em dist/client (frontendDist do Tauri).
// Dependendo da versao do Vite/Nitro a saida vai para .output/public ou dist/public.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const target = resolve(root, "dist/client");

const candidates = ["dist/client", ".output/public", "dist/public"].map((p) =>
  resolve(root, p),
);

const source = candidates.find((dir) => existsSync(resolve(dir, "index.html")));

if (!source) {
  console.error(
    "[prepare-desktop-dist] Nao encontrei index.html em: " +
      candidates.join(", "),
  );
  process.exit(1);
}

if (source !== target) {
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
  console.log(`[prepare-desktop-dist] Copiado ${source} -> ${target}`);
} else {
  console.log("[prepare-desktop-dist] dist/client ja esta pronto.");
}
