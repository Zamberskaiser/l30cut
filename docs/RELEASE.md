# Release Windows — L30 CUT AI

## Pré-requisitos locais

- Windows 10/11 x64, Rust stable, Bun, WebView2 Runtime.
- `bun install`

## Build local

```powershell
bun run test
bunx tauri build
```

Artefatos em `src-tauri/target/release/bundle/` (MSI e NSIS `.exe`).

## Release automatizado

1. Atualize a versão em `package.json`, `src-tauri/Cargo.toml` e `src-tauri/tauri.conf.json`.
2. `git tag vX.Y.Z && git push --tags`
3. O workflow `release.yml` roda testes, gera MSI/NSIS, calcula SHA-256 e cria
   um release em rascunho com `checksums.txt`.
4. Publique o rascunho e copie os hashes para a página `/download`.

## Assinatura de código (pendente)

Sem certificado configurado, o SmartScreen exibirá aviso na primeira execução.
Para assinar, adicione os secrets `WINDOWS_CERTIFICATE` e
`WINDOWS_CERTIFICATE_PASSWORD` e habilite `bundle.windows.certificateThumbprint`.
