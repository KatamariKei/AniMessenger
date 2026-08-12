# Updating AniMessenger

AniMessenger keeps replaceable application code separate from private runtime data. Even so, back up your local data before a major pre-release update.

## Source-clone installations

From the AniMessenger repository folder, stop the running development server and run:

    git pull --ff-only
    pnpm install --frozen-lockfile
    pnpm check

Start it again with:

    pnpm dev

Use `pnpm dev:lan` instead when testing on another device connected to the same trusted private network.

The following local paths are ignored by Git and remain in place during a normal pull:

- `data/` for chats, profiles, memories, uploads, and relationships;
- `charasms.config.json` for local models, prompts, and machine paths;
- `logs/`, `outputs/`, `backups/`, and other generated runtime material.

Do not run destructive Git cleanup or reset commands against a working installation. If `git pull --ff-only` reports local tracked changes, save or commit those changes before continuing. Custom ComfyUI workflows should use new filenames outside the bundled workflow files under `workflows/`.

## Experimental Windows package

The unpacked Windows installer keeps application files under `%LOCALAPPDATA%\Programs\AniMessenger` and private data under `%LOCALAPPDATA%\AniMessenger`.

Running a newer installer package replaces application files while leaving the private-data directory intact. This is the intended upgrade foundation, but automatic version detection, rollback, uninstall registration, code signing, and a bundled Node runtime are not complete yet.

The packaged installation does not automatically import chats from a developer source clone. Continue using the clone until a tested migration/import flow is available, or manually retain its `data/` folder and configuration as a backup.

## Before updating

For a source clone, copy these items somewhere safe:

    data
    charasms.config.json

For a packaged installation, back up:

    %LOCALAPPDATA%\AniMessenger

## After updating

1. Open Settings and confirm the selected Ollama and ANIMA models.
2. Use **Check image setup** if ComfyUI workflows or models changed.
3. Open an existing chat and verify its messages, relationship, memory, and gallery.
4. If the update fails, preserve the private-data backup before reinstalling or reporting the problem.
