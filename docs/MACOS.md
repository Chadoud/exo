# macOS install guide

Exo ships as a **`.dmg`** installer. **Public downloads** use one **universal** build (`Exo-universal.dmg` / `Exo.dmg`) for **Apple Silicon (M-series)** and **Intel** Macs.

**Local builds** default to a **native** installer for your Mac only (`Exo-arm64.dmg` or `Exo-x64.dmg`) — smaller, with a single Python backend slice.

The Electron shell is either universal (release) or native (local default). The Python backend ships as separate PyInstaller **onedir** builds per CPU (`backend-x64/` and/or `backend-arm64/`, each containing a `backend` launcher); Exo launches the correct one at runtime. (Arch-specific PyInstaller bundles cannot be merged with `lipo` — that produces a broken “universal” backend on Intel.)

## Download

1. Get **Exo.dmg** from [exosites.ch](https://exosites.ch) or a green **Build Installers** run on GitHub Actions.
2. Artifact **EXO-macOS** contains `Exo.dmg` (alias of `Exo-universal.dmg` on release builds).

Build locally on a Mac:

```bash
npm run build:mac                    # native Exo-{arm64|x64}.dmg (smaller)
EXO_MAC_UNIVERSAL=1 npm run build:mac  # universal Exo-universal.dmg (like CI)
```

## Install

1. Open the `.dmg`.
2. Drag **Exo** into **Applications**.
3. Eject the disk image, then launch from **Applications** (not from the mounted disk).

## First launch (unsigned builds)

CI builds are **not notarized** yet. macOS may block the app:

1. **Right-click** the app in Applications → **Open**, then confirm **Open** once.
2. Or: **System Settings → Privacy & Security** → allow the app after the first blocked attempt.

## First-run setup

The setup wizard installs or verifies:

- **Ollama** (local AI runtime)
- Default **Mistral** model (~4 GB download)
- **Tesseract OCR** (optional — offers Homebrew install if you approve)

Allow **microphone** access when prompted — required for voice commands and the AI assistant.

## Requirements

| Item | Notes |
|------|--------|
| macOS | 12 Monterey or later recommended |
| Disk space | ~5 GB free for Ollama + default model |
| Homebrew | Optional; used by setup to install Tesseract if missing |
| Microphone | Required for voice features |

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| “App is damaged” / won’t open | Remove quarantine: `xattr -cr "/Applications/Exo.app"` |
| Stuck on “Starting Exo on this computer…” | Quit fully (Cmd+Q), reopen from Applications; use **Restart service**; ensure v1.1.9+ (fixes Intel backend) |
| Backend offline | Quit and reopen; check nothing else uses port **7799** |
| Ollama errors | Install from [ollama.com](https://ollama.com) or rerun setup |
| OCR missing | `brew install tesseract` or approve install in setup |
| Voice not working | **System Settings → Privacy & Security → Microphone** → enable for Exo |

## Code signing (publishers)

For public distribution without Gatekeeper friction:

1. Apple **Developer ID Application** certificate
2. Set `build.mac.identity` in `package.json` (or CI secret)
3. Enable **notarization** in electron-builder
4. See [DISTRIBUTION.md](DISTRIBUTION.md)
