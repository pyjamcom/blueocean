# Anima API setup for Escapers

This project includes a CLI script that generates code from Figma frames through Anima's official SDK.

## Files
- Script: `scripts/anima_codegen_from_figma.js`
- Anima env template: `config/anima_api.env.example`
- Figma env template: `config/figma_api.env.example`

## 1) Create local env files

Create local runtime files (both are ignored by git):

- `config/anima_api.env`
- `config/figma_api.env`

Example:

```env
# config/anima_api.env
ANIMA_API_TOKEN=YOUR_ANIMA_TOKEN
ANIMA_TEAM_ID=
ANIMA_USER_ID=
ANIMA_FRAMEWORK=react
ANIMA_LANGUAGE=typescript
ANIMA_STYLING=plain_css
ANIMA_UI_LIBRARY=
ANIMA_OUT_DIR=reports/anima
```

```env
# config/figma_api.env
FIGMA_ACCESS_TOKEN=YOUR_FIGMA_TOKEN
FIGMA_FILE_KEY=z8NmGr4kz5UO2woLmgkZDC
FIGMA_NODE_ID=0:1
```

## 2) Run code generation

```bash
npm run anima:figma
```

Output is written to:
- `reports/anima/<fileKey>_<timestamp>/...`
- `reports/anima/<fileKey>_<timestamp>/anima_run.json`

## 3) Override from CLI

```bash
node scripts/anima_codegen_from_figma.js \
  --file-key z8NmGr4kz5UO2woLmgkZDC \
  --node-id 0:1 \
  --framework react \
  --language typescript \
  --styling plain_css
```

Multiple node IDs:

```bash
node scripts/anima_codegen_from_figma.js --node-ids 0:1,12:34,56:78
```

## Notes
- This script uses the official package `@animaapp/anima-sdk`.
- Keep tokens only in local env files; do not commit them.
- Generated code is a baseline. Manual integration into the existing app architecture is still required.
