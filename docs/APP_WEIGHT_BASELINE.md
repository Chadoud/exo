# App weight baseline

Measured on macOS universal build (2026-06). Re-run `bash scripts/report-app-weight.sh` after packaging.

| Component | Approx. size | Share | Notes |
|-----------|--------------|-------|--------|
| Electron (Chromium) | ~412 MB | ~67% | Universal binary in `Frameworks/` |
| PyInstaller `backend` onedir | ~196 MB | ~32% | Sort, OCR, integrations, automation (no one-file extract on launch) |
| Renderer (`app.asar` + JS) | ~8 MB | <2% | React UI; code-split by tab + locale |

**DMG:** ~**294 MB** native x64 (was ~368 MB universal); **arm64 builds should be similar**. Universal: `npm run build:mac:universal`.

**Initial JS (after S1 split):** main `index` chunk ~**396 KB** (was ~2 MB); locales/fr/de/it load on demand (~184–191 KB each).

## macOS packaging

| Command | Output |
|---------|--------|
| `npm run build:mac` | Native arch DMG (`Exo-arm64.dmg` or `Exo-x64.dmg`) + `Exo.dmg` alias |
| `npm run build:mac:universal` | Fat binary `Exo-universal.dmg` (larger, runs on any Mac) |

## What moves the needle

- **Install size:** Electron packaging (arch-specific builds), backend tier split (core vs automation).
- **Startup / RAM:** Frontend code splitting, lazy i18n, defer heavy panels, backend lazy imports.

## Tooling

```bash
# Size breakdown (DMG, .app, backend, frontend chunks)
bash scripts/report-app-weight.sh

# Interactive bundle graph
cd frontend && npm run analyze
# → opens frontend/dist/stats.html
```

## CI budgets (soft)

See `scripts/report-app-weight.sh` footer. Failures are manual review until CI gate is wired.
