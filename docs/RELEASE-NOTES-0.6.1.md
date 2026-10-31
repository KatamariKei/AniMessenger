# AniMessenger 0.6.1

A maintenance update focused on faster conversations, safer saves and more consistent illustrated scenes.

## Faster, smoother conversations

- Less avoidable work around chat generation and character research, with leaner prompts and scene metadata.
- Optional preparation of the selected chat model when opening or returning to a ready chat can reduce the first-reply wait after idle. Preparation backs off during other work and does not create a chat message.
- Story replies stream into the existing paced reading experience. The received sound plays when text first appears; Messaging keeps the completed bubble and its sound together.
- Large conversation histories merge more efficiently in the interface.

These improvements retain character personality, memory and user-selected models. Response time still depends on local hardware, model, context size and reply length; a universal speedup is not promised. Context settings are inherited rather than forcing 64K on every computer.

## Scenes and pictures that stay together

- Better handling of current rooms, final poses, clothing changes and eye state.
- Images use a verified current-scene snapshot. When the latest exchange leaves a scene uncertain, a focused review can recover the supported state without reverting to an old doorway or earlier action.
- Grounded room checkpoints survive unsupported renaming, while actual evidenced moves remain eligible to update the room.
- Unsupported optional atmosphere or action details can be omitted instead of blocking an otherwise grounded picture or reusing stale staging.
- Improved source-supported visual identity and narrower foreground scene output, with continuity safeguards retained.

Exact image continuity is still model-dependent. A genuinely unresolved essential scene can still produce an actionable retry message.

## More reliable character setup

- Combine compatible catalogue evidence and resolve short aliases to their main character entries.
- Recognize fan-created franchise descriptions and show source/provider information so ambiguous search results are easier to understand.
- Retry an unfinished character with enriched sources while retaining its selected identity. Different franchises and uncertain same-name identities remain separate.
- Clearer explanations when a fan-created character lacks enough documented background. Setup still requires grounded evidence when research is enabled.
- Story mode detects clear first-person narrator drift while preserving first-person quoted dialogue, with a bounded correction attempt.

## Safer everyday use

- Atomic saves preserve the previous valid conversation, profile, settings or image-job record if a write fails.
- Concurrent reply/image completions preserve newer conversation changes. Deleted or replaced conversations cannot be recreated by stale work.
- Local API Host/origin checks restrict unrelated websites' browser access. This is not a public remote-access or device-authentication feature.

## Updating

Download `AniMessenger-Windows-v0.6.1.zip`, extract it and run the included installer. Existing application files are replaced separately from private chats, memories, profiles, settings and image references. Back up your private data before updating.

The bundled image model and recommended workflow are unchanged. No model switch, ComfyUI reinstall or GPU-driver change is required by this update.

New feature ideas—including original-character creation, immersive mode and an image remixer—are not included in this maintenance release.
