# Publicação do instalador Gutty TEF

## Por que não fica no repo

O instalador empacotado pesa muito:
- ZIP fallback: ~185 MB
- NSIS único (.exe): ~120 MB

Ambos estouram o **limite do GitHub (100 MB/arquivo)** e do **Vercel (100 MB/deploy)**.
Por isso o binário **não mora em `public/downloads/`** — vai pra **GitHub Releases**
(limite 2 GB por asset, CDN incluso, sem custo).

## Fluxo de build → publicação

```text
[ npm run pack ]              gera ./bin/gutty-tef-setup.{exe,zip}
        ↓
[ npm run deploy:release ]    calcula SHA-256, mostra instrucoes de upload
        ↓
[ Upload em GitHub Releases ] arquivo fica em
                              github.com/<owner>/<repo>/releases/latest/download/<file>
        ↓
[ PDV resolve URL via ]       caixa.gutty.app.br/api/tef/installer/info
[ /api/tef/installer/info ]   devolve { url, type, label, version, sizeMb }
        ↓
[ Botao "Baixar" ]            <a href="/api/tef/installer/download">
                              302 → github.com/.../releases/.../gutty-tef-setup.zip
```

## Passo a passo

### 1) Build local

```powershell
cd scripts/gutty-tef-installer-gui
npm install
npm run pack
```

Saída em `./bin/gutty-tef-setup.zip` (ou `.exe` se Developer Mode ON).

### 2) Calcular metadata + ver instruções

```powershell
npm run deploy:release
```

Mostra tamanho e SHA-256. Se você tiver `gh` CLI instalado, ele já te dá o
comando exato. Senão, dá as instruções via web.

### 3a) Upload via web (sem gh CLI)

1. Abre <https://github.com/rczervinski/caixa-gutty/releases>
2. **Draft a new release** (ou editar a release `tef-installer-latest`)
3. **Choose a tag** → `tef-installer-latest` (criar se não existir)
4. **Title:** `Gutty TEF Setup tef-installer-latest`
5. Arraste `bin/gutty-tef-setup.zip` (e `.exe` se tiver) pro campo "Attach binaries"
6. ✅ Marque **Set as the latest release**
7. **Publish release**

### 3b) Upload via gh CLI

```powershell
# primeira vez (cria a tag e a release)
gh release create tef-installer-latest `
  bin/gutty-tef-setup.zip `
  --title "Gutty TEF Setup latest" `
  --notes "Instalador Gutty TEF"

# atualizações subsequentes (substitui o asset)
gh release upload tef-installer-latest bin/gutty-tef-setup.zip --clobber
```

### 4) (Opcional) atualizar metadata no PDV

Em `.env.production` (ou painel Vercel):

```env
TEF_INSTALLER_VERSION=1.0.0
TEF_INSTALLER_SIZE_MB=185
TEF_INSTALLER_DEFAULT_TYPE=zip   # ou "exe" quando tiver NSIS único
```

Tudo opcional. Sem isso o botão funciona normalmente, só não mostra versão/tamanho.

## Env vars que controlam a URL

Resolvidas em `/app/api/tef/installer/info/route.ts`:

| Variável                       | Default                           | Quando usar                                 |
|--------------------------------|-----------------------------------|---------------------------------------------|
| `TEF_INSTALLER_URL`            | (vazio)                           | Override total (ex: hospedar em R2 próprio) |
| `TEF_INSTALLER_URL_EXE`        | (vazio)                           | URL específica do .exe                      |
| `TEF_INSTALLER_URL_ZIP`        | (vazio)                           | URL específica do .zip                      |
| `TEF_INSTALLER_GH_OWNER`       | `rczervinski`                     | Mudar de owner                              |
| `TEF_INSTALLER_GH_REPO`        | `caixa-gutty`                     | Mudar de repo                               |
| `TEF_INSTALLER_GH_TAG`         | `latest`                          | Fixar versão (ex: `v1.2.0`)                 |
| `TEF_INSTALLER_DEFAULT_TYPE`   | `zip`                             | Trocar pra `exe` quando subir NSIS único    |
| `TEF_INSTALLER_VERSION`        | (vazio)                           | Mostrar versão no tooltip                   |
| `TEF_INSTALLER_SIZE_MB`        | (vazio)                           | Mostrar tamanho no botão                    |

## Por que GitHub Releases é seguro pra isso

- **Asset público** mas o que está dentro do ZIP é o **instalador genérico** —
  ele só consome a config sensível (CNPJ, sitefIp, storeId) DEPOIS de o usuário
  colar o token de pareamento de uso único.
- Assinatura via SHA-256 (mostrado no `deploy:release`) permite verificar
  integridade caso algum dia precise.
- Trocar de hospedagem é mudar 1 env var.

## Migrando da versão antiga (public/downloads)

Tudo que tava em `public/downloads/*.exe` e `*.zip` agora está no `.gitignore`.
Pra limpar artefatos legados que possam ter ficado no histórico, use
`git filter-repo` ou ignore — eles não atrapalham o build.
