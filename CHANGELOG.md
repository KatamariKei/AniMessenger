# Changelog

AniMessenger is pre-release software. Changes may still adjust local data, model prompts, and installation behavior.

## 0.3.1

### Windows installation

- Bundle a checksum-verified private Node.js runtime so packaged users do not install Git, Node.js, npm, or pnpm.
- Distinguish install, same-version repair, update, and protected downgrade behavior.
- Preserve private chats and settings during application replacement and normal uninstall.
- Register AniMessenger in Windows Installed Apps and add application-folder rollback on failed updates.
- Produce a versioned ZIP suitable for a GitHub release attachment.
- Automatically create and select ComfyUI's standard output folder after its models folder is found, with a manual override for custom layouts.
- Add an Ollama GPU readiness test that reports CPU offloading and can unload competing Ollama models before retesting with a conservative context.
- Apply the official AniMessenger icon to Windows shortcuts, Installed Apps, browser tabs, iOS home-screen bookmarks, and installable web-app metadata.
- Replace the hidden script launcher and separate Stop shortcut with a native branded tray companion for Open, Start, Stop, update discovery, and Quit.
- Distinguish a stopped AniMessenger service from an Ollama outage in the browser and confirm tray Start/Stop actions with concise Windows notifications.

### Guest chats

- Remove the experimental label from the completed guest-chat presentation and documentation.

### Image reliability

- Keep profile-picture, chat-image, proactive-image, and retry jobs attached to their original request when browser polling overlaps background recovery.
- Prevent completed profile pictures from being misfiled as synthetic gallery messages.
- Normalize plain-language empty wardrobe values such as `none` to the explicit ANIMA prompt `completely nude` for new images and retries.
- Give overlapping image-job saves independent temporary files so one job cannot disrupt another job's attribution record.

## 0.3.0

### Guest chats

- Invite one already-researched character into an active chat.
- Keep private histories isolated while sharing only the live encounter.
- Route replies by direct address and conversational focus, with restrained character-driven interjections.
- Track relationship progress independently for both participants.
- Generate separate solo images when both characters are asked for pictures.
- Carry a bounded shared-event memory back to each character after the encounter.

### Installation and updates

- Add an experimental Git-free Windows package and installer foundation.
- Separate replaceable application files from private chats, settings, uploads, and memories.
- Add first-run diagnostics for Ollama, ComfyUI, models, workflows, and image assets.
- Document safe update procedures for source clones and packaged installations.

### Reliability and polish

- Expand structured Ollama responses across chat, reactions, proactive messages, research, and memory extraction.
- Improve image retry behavior, prompt construction, asset validation, and recovery messaging.
- Refine mobile navigation, modals, chat layout, accessibility, and current-scene presentation.
