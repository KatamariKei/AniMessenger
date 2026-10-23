# v0.6.0 candidate validation

Prepared October 19, 2026; final package rebuilt and rehearsed October 22 after 3090 test feedback. Not published.

October 22: user confirmed the remaining 3090 functional smoke checks are in order: memory rescan, image failure/retry, achievement sequencing and single-award behavior, and restart persistence. User dossier and discovery/artwork checks also passed. Final automated validation and package refresh follow this sign-off.

## Passed

- TypeScript checking, all 812 automated tests and a production build.
- Yukari and Rise discovery research passed user testing; Yukari also passed on a fresh 3090 installation.
- User confirmed discovery unlocks and artwork work well on the 3090.
- User confirmed the user dossier/profile works well on the 3090.
- 3090 dossier scrolling resolved after the user enabled browser graphics acceleration in Chrome and Firefox. Chrome's report confirmed software compositing before that change; traces showed compositor stalls rather than page JavaScript/layout work. The dossier CSS changes alone did not resolve the issue. Browser troubleshooting is documented in the README and Windows installation guide.
- Public-source privacy audit: no private runtime data, machine paths or obvious secrets detected.
- Independent audit of the extracted ZIP: 119 packaged files checked.
- Actual Windows installer execution into an isolated empty application/private-home pair, with no shortcuts, registration or tray launch.
- Booting the newly installed app with its bundled Node runtime, serving the production frontend and shared runtime modules.
- Actual installer upgrade from the existing v0.5.0 ZIP into an isolated test installation.
- Six synthetic private files preserved byte-for-byte across installation: settings; chat with memory and checkpoint; achievement ledger; uploaded-content fixture; memory-scan receipt; discovery-data fixture.
- Upgraded packaged server reads the synthetic memory and reports its ten existing achievement points.
- Recommended image workflow, mapping and image-asset manifest match v0.5.0 byte-for-byte. No default-model switch.

Reproducible automated rehearsal: `node scripts/rehearse-windows-release.mjs`.

## Candidate

Archive: `AniMessenger-Windows-v0.6.0.zip`

Use the main archive above. Earlier `dossier-scroll-test` and `scroll-test` ZIPs are superseded diagnostic builds, not the final documentation-refreshed package.

SHA-256: `567b95aed64e296282e4c89e76ef858865563926b9f27b4a72b0853b464d6c0a`

Final October 22 verification: 812/812 tests, typecheck and production build passed; source privacy audit checked 281 files; extracted archive audit checked 119 files. Fresh install/boot and v0.5.0 upgrade passed in isolation, with six synthetic private files byte-identical and default workflow/assets unchanged. Report: `release/rehearsal-v0.6.0-rUWVMk/report.json` (ignored local artifact). Initial sandboxed tests hit file-operation restrictions; the full normal-permission rerun passed.

## Still required before publication

- A separate second-PC upgrade rehearsal was not confirmed after the user switched to a fresh install; automated v0.5.0-to-v0.6.0 preservation rehearsal covers the installer update path.
- Final public-diff review and approval before commit, push, tag and publication.

No live conversations, settings or services were replaced by this rehearsal. This is not a signed installer and does not claim compatibility with every model, custom ComfyUI node or hardware configuration.

## Deferred to the next release

- Investigate chat-to-narrative mode transitions: Bayonetta on the 3090 produced first-person narration after switching an existing chat, despite third-person Story-mode instructions. A mode-transition/context conflict is suspected, not proven. Review history and prompt precedence, strengthen narrator/dialogue separation, and add regression coverage and a targeted quality retry without rejecting first-person quoted dialogue. User explicitly designated this a non-blocker for v0.6.0.
