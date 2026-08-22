# Updating AniMessenger

AniMessenger keeps replaceable application code separate from private runtime data. Even so, back up your local data before a major pre-release update.

## Source-clone installations

From the AniMessenger repository folder, stop the running development server and run:

    git pull --ff-only
    pnpm install --frozen-lockfile
    pnpm check

Start it again with:

    pnpm dev

Use `pnpm dev:lan` instead when testing on another device connected to the same trusted private network. On Windows, `pnpm dev:tray` builds and opens the development tray companion; its **Phone access** toggle switches the same managed service between PC-only and LAN mode on port 5173.

The following local paths are ignored by Git and remain in place during a normal pull:

- `data/` for chats, profiles, memories, uploads, and relationships;
- `animessenger.config.json` for local models, prompts, and machine paths;
- `logs/`, `outputs/`, `backups/`, and other generated runtime material.

Do not run destructive Git cleanup or reset commands against a working installation. If `git pull --ff-only` reports local tracked changes, save or commit those changes before continuing. Custom ComfyUI workflows should use new filenames outside the bundled workflow files under `workflows/`.

## Self-contained Windows package

The unpacked Windows installer keeps application files under `%LOCALAPPDATA%\Programs\AniMessenger` and private data under `%LOCALAPPDATA%\AniMessenger`.

Running a newer installer package stops the installed app, replaces its versioned application files, and leaves the private-data directory intact. The installer now identifies install, repair, update, and downgrade states; carries its own Node.js runtime; rolls back a failed application-folder replacement; and registers a standard Windows uninstall entry.

Use **Check for updates** from the AniMessenger tray icon to open the latest GitHub release. Download and extract the newer package, then run `Install-AniMessenger.cmd` to update. Automatic download/installation, code signing, and clone-to-package migration are not complete yet.

The packaged installation does not automatically import chats from a developer source clone. Continue using the clone until a tested migration/import flow is available, or manually retain its `data/` folder and configuration as a backup.

A normal uninstall preserves `%LOCALAPPDATA%\AniMessenger`. Removing that private-data directory requires the explicit `-PurgeData` option in the bundled PowerShell uninstaller.

## Before updating

For a source clone, copy these items somewhere safe:

    data
    animessenger.config.json

For a packaged installation, back up:

    %LOCALAPPDATA%\AniMessenger

## After updating

1. Open Settings and confirm the selected Ollama and ANIMA models.
2. Use **Check image setup** if ComfyUI workflows or models changed.
3. Open an existing chat and verify its messages, relationship, memory, and gallery.
4. If the update fails, preserve the private-data backup before reinstalling or reporting the problem.
