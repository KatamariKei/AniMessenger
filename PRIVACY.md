# Privacy

AniMessenger is local-first software, not a hosted chat service. The project does not include telemetry, advertising, user accounts, or an AniMessenger-operated conversation server.

## What stays on the computer

AniMessenger stores conversations, character profiles, memories, relationships, scene state, uploads, settings, and generated-image references in local files. Ollama and ComfyUI are local services by default. These private paths are excluded from the public repository and from the release package audit.

Deleting the application code does not automatically delete local conversations or generated images. Users control those files and their backups.

## Network connections

Some features make direct requests from the user's computer to third-party or user-configured services:

- AnimaDex provides character search results and catalogue images.
- AniList and Wikipedia may provide limited public character research used to build a profile.
- Ollama receives prompts and conversation context at the configured Ollama address.
- ComfyUI receives image prompts and workflow data at the configured ComfyUI address.

With the default configuration, Ollama and ComfyUI use loopback addresses on the same computer. If a user changes those addresses to remote services, the corresponding prompts or images leave the computer and are governed by that service's privacy practices.

Character search and research queries may reveal the character or series being requested to AnimaDex, AniList, or Wikipedia. AniMessenger does not intentionally send private chat history to those catalogue and research services.

## Guest chats

Private character-chat histories remain separate during a guest encounter. A guest receives the shared conversation only from the point at which they join, not the host character's earlier private transcript. When the encounter ends, AniMessenger may save a short local summary of the shared event to both participating characters so that the encounter can be remembered later.

## Phone and network access

LAN mode makes the AniMessenger interface reachable on the local network. It currently has no account system or multi-user authentication, so it should only be used on a trusted private network. Do not expose its ports directly to the public internet.

## Reports and shared diagnostics

Logs, screenshots, crash dumps, prompts, profiles, and thread files can contain private material. Review and redact them before attaching them to an issue or sharing them with another person.

This document describes the behavior of the open-source project. A modified build or separately operated service may behave differently.
