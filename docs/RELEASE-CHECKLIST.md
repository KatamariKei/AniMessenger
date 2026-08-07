# AniMessenger release checklist

This checklist prepares a public repository without exposing the creator's local conversations, profiles, settings, generated images, logs, or backups.

## Safety boundary

- [x] Keep `data/`, `logs/`, `outputs/`, `work/`, `backups/`, and local configuration out of Git.
- [x] Keep build caches, dependency folders, and Codex task state out of Git.
- [x] Add a repeatable `pnpm release:audit` check for private paths and common secrets.
- [x] Run the release audit and full test/build check from a clean copy.
- [x] Inspect the current pre-branding public candidate (81 files; no private runtime paths included).
- [x] Inspect the final proposed file list (104 public files; private runtime data and generated output excluded) before creating a remote repository.

## First-run experience

- [x] Document supported Windows and Node versions.
- [x] Add clear Ollama, ComfyUI, and AnimaDex setup instructions.
- [x] Detect missing services and explain how to recover in the interface.
- [x] Provide a safe example configuration with no machine-specific paths.
- [x] Test a completely new user startup with an empty `data/` directory.

## Portability

- [x] Document the exact ComfyUI model, VAE, CLIP, LoRAs, and custom nodes used by the bundled workflow.
- [x] Add a workflow compatibility check with actionable error messages.
- [x] Verify desktop, iPhone-sized, tablet, and LAN layouts.
- [x] Verify Windows path handling and output-folder recovery.

## Product polish

- [x] Finalize the name, color palette, application icon, and social preview art.
- [x] Replace or remove prototype-only branding and preview artwork.
- [x] Review empty, loading, offline, and error states.
- [x] Review keyboard, focus, touch-target, and screen-reader behavior.

## Repository launch decisions

- [x] Choose a software license (MIT).
- [x] Add contribution, issue-reporting, privacy, content, and security notices.
- [x] Begin with a clean public history while retaining the prototype branch locally as a private safety reference.
- [x] Connect a private GitHub repository only after the clean release candidate passes inspection; keep it private until the final launch decision.

## Final gate

Run:

    pnpm release:audit
    pnpm check

Then inspect the candidate from a fresh directory before publishing anything.
