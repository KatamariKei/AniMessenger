# AniMessenger Windows installer foundation

This is the first Git-free Windows packaging path. It is intentionally conservative while the installer is tested.

## What it does

- copies AniMessenger into `%LOCALAPPDATA%\Programs\AniMessenger`;
- stores chats, profiles, uploads, settings, logs, and recovery state separately in `%LOCALAPPDATA%\AniMessenger`;
- creates Start menu and optional desktop shortcuts;
- launches the production build on `http://127.0.0.1:5173`;
- opens the existing first-run guide, which detects Ollama, ComfyUI, models, and workflows;
- upgrades application files without deleting private local data.

Rerunning a newer package is the current manual update path. Application folders are refreshed, while `%LOCALAPPDATA%\AniMessenger` remains untouched.

## Current prerequisite

This foundation still requires Node.js 22 or newer. Git and a source checkout are not required. A later packaging pass can bundle a private Node runtime and remove this prerequisite without changing the storage layout.

Ollama and ComfyUI remain separate optional services. AniMessenger explains what is missing during first run instead of silently installing multi-gigabyte AI software.

## Build the test package

From the project directory, run:

    npm run package:windows

The unpacked test package is written to `release\AniMessenger-Windows`. Run `Install-AniMessenger.ps1` from that folder. Windows may require **Run with PowerShell** because this is not yet a signed installer.

The existing developer copy continues using its project-local `data` folder and `charasms.config.json`; packaging does not move or modify it.

## Current update boundary

- A packaged install and a source clone are separate installations.
- The installer does not yet import a clone's chats or settings.
- Automatic update checks, rollback, uninstall registration, code signing, and bundled Node are still pending.
- Before installing an update, back up `%LOCALAPPDATA%\AniMessenger`.

See [Updating AniMessenger](UPDATING.md) for the current clone and package update procedures.
