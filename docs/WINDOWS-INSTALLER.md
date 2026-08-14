# AniMessenger Windows package

AniMessenger's self-contained Windows package is the Git-free installation path.

## What it does

- carries a private, checksum-verified Node.js runtime used only by AniMessenger;
- installs replaceable application files under `%LOCALAPPDATA%\Programs\AniMessenger`;
- stores chats, profiles, uploads, settings, logs, and recovery state separately under `%LOCALAPPDATA%\AniMessenger`;
- installs a branded tray companion and Start-menu/desktop shortcuts;
- provides **Open AniMessenger**, **Start service**, **Stop service**, **Check for updates**, and **Quit AniMessenger** from the tray icon;
- registers AniMessenger under **Windows Settings > Apps > Installed apps**;
- distinguishes a first install, same-version repair, newer-version update, and intentional forced downgrade;
- rolls the application folder back if replacement fails;
- preserves private local data during repair, update, and normal uninstall.

Git, Node.js, npm, and pnpm are not required on the destination computer. Ollama and ComfyUI remain separate services because the right models depend heavily on the user's hardware. AniMessenger's guided setup detects what is missing and provides recovery guidance.

## Download and install

Download the Windows ZIP from the repository's [latest GitHub release](https://github.com/KatamariKei/AniMessenger/releases/latest), then:

1. Extract the ZIP to a normal folder.
2. Double-click `Install-AniMessenger.cmd`.
3. Allow the installer to finish and open AniMessenger.
4. Look for the AniMessenger icon in the Windows notification area. Windows may initially place it behind the tray overflow arrow.

The package is not yet code-signed, so Windows may show a reputation warning. Only install archives downloaded from the official AniMessenger repository.

## Tray companion

The tray icon is the installed app's control center:

- double-click it to open AniMessenger;
- **Open AniMessenger** starts the service when needed and opens the browser;
- **Start service** runs AniMessenger without opening a browser;
- **Stop service** stops the local AniMessenger service while leaving the tray available;
- **Check for updates** opens the latest GitHub release;
- **Quit AniMessenger** stops the service and closes the tray companion.

Closing a browser tab does not stop AniMessenger. The in-app **Settings > Shut down AniMessenger** control stops the service; the tray remains available so it can be started again. These controls do not stop Ollama or ComfyUI and do not delete chats or settings.

## Update or repair

Extract a newly downloaded ZIP before running its installer.

- No existing installation: **Install**.
- Same version already present: **Repair**.
- Newer package: **Update**.
- Older package: blocked unless PowerShell is run with the explicit `-Force` switch.

The installer closes the installed tray and service before replacing application files, then launches the updated tray. It does not move or rewrite `%LOCALAPPDATA%\AniMessenger`.

## Build the package

From the project directory, run:

    npm run package:windows

The first build downloads the pinned official Node.js Windows x64 archive into the ignored `.runtime-cache` directory, verifies its SHA-256 checksum, and reuses it later. Windows' built-in .NET Framework compiler produces the small native tray executable. Finished outputs are written to:

    release\AniMessenger-Windows
    release\AniMessenger-Windows-vVERSION.zip

## Uninstall

Use **Windows Settings > Apps > Installed apps > AniMessenger > Uninstall**. A normal uninstall removes application files, the tray companion, and shortcuts but preserves `%LOCALAPPDATA%\AniMessenger`, allowing a later reinstall to recover chats and settings.

Deleting private data is deliberately separate. Advanced users can run `Uninstall-AniMessenger.ps1 -PurgeData` when they explicitly want to remove chats, profiles, settings, uploads, and logs too.

## Current boundary

- Windows x64 is the current packaged target.
- The package is not yet code-signed.
- Update discovery opens GitHub Releases; automatic download and installation are not implemented yet.
- A packaged install and a source clone are separate installations; automatic clone-to-package migration is not implemented.
- A clean-account and second-PC rehearsal is required for each release candidate.

See [Updating AniMessenger](UPDATING.md) for source-clone and packaged-update procedures.
