# AniMessenger release checklist

This checklist prepares a public repository without exposing the creator's local conversations, profiles, settings, generated images, logs, or backups.

## Safety boundary

- [x] Keep `data/`, `logs/`, `outputs/`, `work/`, `backups/`, and local configuration out of Git.
- [x] Keep build caches, dependency folders, and Codex task state out of Git.
- [x] Add a repeatable `pnpm release:audit` check for private paths and common secrets.
- [x] Run the release audit and full test/build check from a clean copy.
- [x] Inspect the current pre-branding public candidate (81 files; no private runtime paths included).
- [x] Inspect the final proposed public file list; private runtime data and generated output are excluded.

## First-run experience

- [x] Document supported Windows and Node versions.
- [x] Add clear Ollama, ComfyUI, and character-catalogue setup instructions.
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
- [x] Add one-guest conversations with distinct identities, turn routing, shared images, relationship progress, and bounded encounter memory.
- [x] Keep private-chat histories isolated during guest encounters.
- [x] Add conservative, cooldown-limited character interjections without an extra director-model call.

## Before the next release

- [x] Improve outfit specificity and continuity in generated-image prompts. Vague scene wardrobe values such as `casual clothes` or `bikini` are expanded into stable, character-informed designs with a defined cut or silhouette, material or pattern, colors, and a distinguishing detail. Preserve those details across subsequent images until the scene establishes a clothing change, reducing reinterpretation without pretending image continuity can be perfect.
- [x] Add durable-memory lifecycle handling. When a promised plan or open loop is completed, replace or retire the future-tense memory and save the concrete outcome—including who won, what changed, and any consequence that remains active—so stale plans cannot override completed events in later conversation.
- [x] Consolidate semantically duplicate memories across categories. A single subject should not accumulate competing `promise`, `open_loop`, and `shared_event` versions with slightly different wording; merge them into one current canonical fact while preserving useful keywords and source references.
- [x] **Make key visual moments reliable.** Recognize third-person direction and character-reported transitions such as finishing a workout, showering, getting dressed, arriving somewhere visually distinctive, unveiling something, or texting back with a reveal. Preserve apart/together presence, add the latest visible evidence to the image brief, and never allow a solo or guest reply to claim it sent a current selfie or photo without either queuing the image or repairing the reply.
- [x] Add an original, lightweight sound layer for messages, camera capture, completed photos, and major bond milestones, with a master toggle, volume control, previews, and silent background proactive delivery.

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

## 0.6.1 maintenance release candidate

- [x] Summarize code-review fixes, speed improvements, Story delivery, scene continuity and catalogue identity changes in release notes.
- [x] Bump package version and README download filename to 0.6.1.
- [x] Prepare an isolated public-source candidate, excluding private data, local experiments/design previews and internal development notes.
- [x] Pass clean-source privacy audit, TypeScript, 963 tests and production build.
- [x] Build the Windows ZIP and audit its 134 packaged files.
- [x] Match packaged application sources/workflows/assets against the clean candidate.
- [x] Rehearse fresh installation and upgrades from v0.6.0 and v0.5.0, preserving six synthetic private files byte-for-byte.
- [x] Verify default workflow, mapping and asset manifest are unchanged.
- [x] Record candidate checksum and validation limits in [v0.6.1 validation](RELEASE-VALIDATION-0.6.1.md).
- [x] User explicitly waived an additional 3090/manual second-PC test of this exact ZIP after reviewing the automated validation results.
- [x] Obtain explicit approval to commit the reviewed source set, push, tag and publish the GitHub release.

## 0.6.0 release candidate

- [x] Keep the bundled default image model and workflow unchanged.
- [x] Update package version, download filename and release notes.
- [x] Include shared runtime modules in the Windows installer copy list.
- [x] Pass the public-file privacy audit and full check on the final candidate (812 tests, typecheck and production build).
- [x] Build and independently inspect the v0.6.0 ZIP (119 audited packaged files).
- [x] Rehearse a clean install and boot with isolated empty storage.
- [x] Rehearse upgrading v0.5.0 with synthetic chats, memories, settings and achievement points preserved (six fixture files unchanged byte-for-byte).
- [x] Complete the packaged-app smoke checks: user confirmed character creation, discovery/artwork, user dossier, achievement celebration, memory rescan, image interruption/retry and persistence on the 3090; mobile dossier checks passed during development.
- [x] Test the candidate on a second PC: fresh 3090 installation passed; browser graphics acceleration resolved scrolling stutter.
- [ ] Review the public diff, then obtain approval to commit, push, tag and publish.

Automated results and the candidate checksum are recorded in [v0.6.0 validation](RELEASE-VALIDATION-0.6.0.md). Re-run `node scripts/rehearse-windows-release.mjs` after rebuilding a changed package; it uses a unique isolated folder, disables shortcuts/registration/tray launch and leaves the live installation alone.

## 0.5.0 release candidate

- [x] Update the package version, README download name, changelog, and public-source user agents.
- [x] Document the recommended hardware floor: 12 GB NVIDIA VRAM and 32 GB system memory for the complete local workflow, with honest experimental guidance for 8 GB hardware.
- [x] Run the expanded public-file audit with no local conversations, generated images, machine paths, or secrets included.
- [x] Pass TypeScript checking, the complete automated test suite, and the production Vite build.
- [x] Build and independently audit `AniMessenger-Windows-v0.5.0.zip` with the pinned Node.js runtime and versioned tray executable.
- [x] Validate packaged character creation on an RTX 3090: Chun-Li completed in 140 seconds including the initial ANIMA load, and Breath of the Wild Zelda completed in 104 seconds with a warm image model; both profiles were solid.
- [x] Test a packaged update over v0.4.0 on the RTX 3090 PC and confirm private data remains intact.
- [x] Test a clean v0.5.0 install on the RTX 3090 PC, including online character sources, Ollama, ComfyUI, and tray startup.
- [x] Complete a focused continuity soak covering explicit room changes, location phrases, persistent outfits, garment removal, Narrative Mode, and image prompts; carry the known vague-location and body-position limitations into the post-release continuity plan.
- [ ] Review the staged public diff, commit, push, tag `v0.5.0`, and attach the final ZIP to the GitHub release.

## 0.4.0 release candidate

- [x] Update the package version, README download name, changelog, privacy notice, content notice, catalogue user-agent, and clean-account helper.
- [x] Run the expanded public-file audit across application, documentation, PowerShell, batch, and C# installer sources.
- [x] Pass TypeScript checking, the automated test suite, and the production Vite build.
- [x] Build `AniMessenger-Windows-v0.4.0.zip` with the pinned Node.js runtime and versioned tray executable.
- [x] Audit all 75 unpacked package files independently of Git and boot the packaged server against isolated empty storage.
- [x] Rehearse updating an existing packaged installation on the RTX 3090 test PC and confirm the application remains usable after the update.
- [x] Rehearse a fresh installation on the RTX 3090 test PC after removing the prior installation, then verify the packaged update path.
- [x] Complete a live UI soak covering first-contact reroll/start, opening-image recovery, location and outfit continuity, pinned chats, missing-image recovery, sound, and mobile access.
- [x] Review the staged public diff, commit, push, tag `v0.4.0`, and attach the final ZIP to the GitHub release.

For every public update:

- [x] Review the complete staged file list and public diff.
- [x] Confirm no runtime data, local configuration, generated images, or machine paths are staged.
- [x] Rehearse updating an existing source clone without losing its ignored data.
- [x] Build the Windows package and verify its contents exclude private runtime data.

## Windows distribution milestone

- [x] Keep installed private data separate from replaceable application files.
- [x] Build a Git-free portable Windows package and shortcut installer foundation.
- [x] Boot the packaged production server against isolated empty storage.
- [x] Bundle a private Node runtime so end users do not install Node separately.
- [x] Add uninstall registration, version-aware upgrades, repair, and application-folder rollback.
- [x] Add a native tray companion for Open, Start, Stop, update discovery, and Quit.
- [ ] Add a signed installer.
- [x] Test the installer on a second PC, including a fresh install, an update, launch, ComfyUI folder setup, and Ollama GPU diagnostics.
- [ ] Test the installer on a clean Windows user account.
