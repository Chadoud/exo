# -*- mode: python ; coding: utf-8 -*-
# PyInstaller 6.x spec for the EXO backend

import os
import sys

_target_arch = os.environ.get("PYINSTALLER_TARGET_ARCH") or None

# Release builds hide the console window (no stray terminal behind the app).
# Set EXOSITES_BACKEND_CONSOLE=1 to keep it visible for local debugging.
_show_console = os.environ.get("EXOSITES_BACKEND_CONSOLE") == "1"

# UPX corrupts macOS Mach-O binaries (and breaks codesigning under the hardened
# runtime), so it is only safe to compress on Windows/Linux.
_use_upx = sys.platform != "darwin"

# GO SYNC crypto lives outside backend/ (repo sync/client/crypto).
# SPECPATH is injected by PyInstaller (directory containing this .spec).
_repo_root = os.path.abspath(os.path.join(SPECPATH, ".."))
_sync_crypto_dir = os.path.join(_repo_root, "sync", "client", "crypto")

a = Analysis(
    ['server.py'],
    pathex=[_sync_crypto_dir],
    binaries=[],
    datas=[],
    hiddenimports=[
        # uvicorn internals
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn._subprocess',
        # app modules
        'main',
        'ingestor',
        'classifier',
        'destination_path',
        'sorter',
        'history',
        # GO SYNC — shared crypto (not under backend/)
        'exosites_crypto',
        'sync_engine',
        'sync_export',
        # dependencies
        'multipart',
        'email.mime',
        'email.mime.text',
        'fitz',
        'docx',
        'pandas',
        'openpyxl',
        'PIL',
        'pytesseract',
        'ollama',
        'anyio',
        'anyio._backends._asyncio',
        'starlette',
        'starlette.routing',
        'fastapi',
        'aiofiles',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # playwright / pyautogui / mss / pyperclip stay bundled on purpose: they power
    # shipped desktop-automation features (computer use, browser autopilot, screen
    # capture, send-message). Their wheels are small — Playwright's heavyweight
    # Chromium browsers are downloaded separately at runtime and never enter this
    # binary — so excluding them would break features for negligible size savings.
    excludes=[
        # Dev/test tooling — never needed in the packaged runtime.
        "pytest",
        "unittest",
        "pydoc",
        "doctest",
        "pip",
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

# onedir (not one-file): avoids multi-minute first-launch extract to a temp
# folder. Electron stages dist/backend/ as Resources/backend-{arch}/ (macOS)
# or Resources/backend/ (Windows).
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=_use_upx,
    console=_show_console,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=_target_arch,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=_use_upx,
    upx_exclude=[],
    name='backend',
)
