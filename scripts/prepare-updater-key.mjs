import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const publicKeyPath = process.argv[2];

if (!publicKeyPath) {
  throw new Error("Caminho da chave publica nao informado.");
}

const configPath = resolve("src-tauri", "tauri.conf.json");
const publicKey = (await readFile(publicKeyPath, "utf8")).trim();

if (!publicKey) {
  throw new Error("A chave publica de atualizacao esta vazia.");
}

const config = JSON.parse(await readFile(configPath, "utf8"));
config.plugins ??= {};
config.plugins.updater ??= {};
config.plugins.updater.pubkey = publicKey;

await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log("  Chave publica aplicada ao instalador.");