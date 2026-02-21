# Figma API setup for Escapers

## Scope
This setup connects the project to Figma REST API and allows exporting file JSON for layout extraction.

Project file:
- URL: `https://www.figma.com/design/z8NmGr4kz5UO2woLmgkZDC/Escapers?node-id=0-1&p=f&m=dev`
- `FIGMA_FILE_KEY`: `z8NmGr4kz5UO2woLmgkZDC`
- Default `FIGMA_NODE_ID`: `0:1`

## Files added
- Local runtime config (ignored): `config/figma_api.env`
- Shareable template: `config/figma_api.env.example`
- Fetch script: `scripts/fetch_figma_file.js`

## 1) Create token in Figma
- Open: `https://www.figma.com/settings`
- Go to: `Personal access tokens`
- Generate token and copy it.

## 2) Save token locally
Edit `config/figma_api.env` and set:

```env
FIGMA_ACCESS_TOKEN=YOUR_TOKEN_HERE
FIGMA_FILE_KEY=z8NmGr4kz5UO2woLmgkZDC
FIGMA_NODE_ID=0:1
```

Do not commit `config/figma_api.env`.

## 3) Fetch file JSON
Run:

```bash
npm run figma:file
```

Output is written to:
- `reports/figma/file_<key>_<timestamp>.json`

## Optional
Fetch specific node and depth:

```bash
node scripts/fetch_figma_file.js --file-key z8NmGr4kz5UO2woLmgkZDC --node-id 0:1 --depth 3
```

Custom output dir:

```bash
node scripts/fetch_figma_file.js --out reports/figma/dev
```

## API endpoint used
- `GET https://api.figma.com/v1/files/:key`
- Header: `X-Figma-Token: <token>`
