# v0.6.1 release validation

Validated October 30, 2026. The user approved publication after reviewing the results and explicitly waived an additional 3090 test of this package.

## Scope

Maintenance release covering the five code-review findings, chat/research latency work, Story delivery and sound timing, scene/image continuity recovery, visual grounding and catalogue identity/source visibility.

The public candidate includes tracked project files, new application/runtime modules, regression tests and release documentation. Local experiments, design previews, internal development notes, unrelated planning drafts and private runtime data are excluded. Excluded local files are preserved in the development workspace.

## Passed

- Clean public-source candidate: 316 reviewed project files; privacy audit passed. Its dependency directory uses the existing local dependency installation and is excluded from release contents.
- Clean-candidate TypeScript checks, all 963 automated tests and production build passed.
- Windows package build passed, including its bundled Node runtime and versioned tray companion.
- Independent audit of the extracted archive: 134 packaged files; no private runtime data, machine paths or obvious secrets found.
- Compared 121 packaged application/runtime-source, shared, workflow and built frontend files against the clean candidate; all matched byte-for-byte. No extra server/shared/workflow files were included.
- Actual Windows fresh install into isolated application/private-home folders, followed by a packaged-server boot and frontend/shared-module checks.
- Actual v0.6.0-to-v0.6.1 installer upgrade and packaged-server boot. Six synthetic private files were preserved byte-for-byte: settings, a conversation with memory/checkpoint, achievements, uploaded content, memory-scan receipt and discovery data.
- A second isolated v0.5.0-to-v0.6.1 upgrade passed the same preservation and startup checks.
- Packaged upgraded server read the existing synthetic memory and retained ten achievement points.
- Recommended image workflow, mapping and model-asset manifest match both previous packages byte-for-byte. No default-model switch.
- Whitespace check passed.

Reproduce with `npm run check`, `npm run release:audit`, `npm run package:windows`, then `node scripts/rehearse-windows-release.mjs 0.6.0` (or `0.5.0`). Rehearsals use unique isolated folders, no shortcuts/registration/tray launch, and blocked optional model/image service addresses. They do not replace the live installation.

## Release package

Archive: `release/AniMessenger-Windows-v0.6.1.zip` (35,217,125 bytes).

SHA-256: `16e7d1bb56745e678e627e4e5578715ae10571dff96c69a12c9895b80a58117a`

Ignored local reports: `release/rehearsal-v0.6.1-HUhqUj/report.json` (v0.6.0 upgrade) and `release/rehearsal-v0.6.1-eYQg7Y/report.json` (v0.5.0 upgrade). The intended public source manifest is retained separately under `release/` for the final commit review.

## Limits and publication gate

The user has tested the development build's Story/Messaging delivery, image continuity, memory recall and corrected fan-character setup. This exact new ZIP has not received a new second-PC or manual mobile smoke test. Automated install/upgrade checks do not establish performance or character quality on every GPU/model combination.

The grounded profile gate and essential image-scene verification remain conservative; limited source material and uncertain scenes can still require a retry. Local origin checks do not provide authenticated public remote access. No universal response-time improvement is claimed.

Preparation did not restart live services, migrate private data, change model selections or alter ComfyUI. The user subsequently authorized committing the reviewed public file set, pushing, tagging `v0.6.1` and publishing this ZIP. The corresponding release is [v0.6.1](https://github.com/KatamariKei/AniMessenger/releases/tag/v0.6.1).
