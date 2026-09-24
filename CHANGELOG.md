# Changelog

AniMessenger is pre-release software. Changes may still adjust local data, model prompts, and installation behavior.

## 0.5.0

### Narrative Mode

- Add an optional long-form Narrative Mode that folds the user's action, character reactions, dialogue, and the next story beat into cohesive prose instead of ordinary message bubbles.
- Preserve paragraph rhythm and quoted dialogue while making the typewriter animation stable, readable, and one-time-only across chat navigation and delayed image completion.
- Keep texting conversations conversational, recover malformed or incomplete story passages, and remove message reactions that do not fit the narrative presentation.

### Character research and creation

- Rebuild character creation around an evidence dossier, source-aware claim checking, and a richer performance guide for personality, emotional range, conversational habits, vulnerabilities, and distinctive voice.
- Improve research recovery so unsupported embellishments are removed without flattening defining flaws, darker traits, canon relationships, or character-specific initiative.
- Merge equivalent catalogue and AnimaDex candidates, normalize franchise variants, reuse useful thumbnails, and keep independent online research available when optional sources fail.
- Strengthen visual-identity and wardrobe requirements so profiles are less likely to pass with generic appearance details, vague clothing, or placeholder voice text.

### Scene, wardrobe, and image continuity

- Separate concise location, detailed environment, and current activity so dialogue fragments and actions no longer become locations or contaminate image prompts.
- Accept explicit location transitions while rejecting figurative movement, relative movement within a setting, and phrases such as `the sauna and enter it` or `the shower and the water feels fantastic`.
- Lock clothing across ordinary location and context changes; school, work, weather, or going outdoors no longer silently replaces a known outfit.
- Track explicit garment removal incrementally, preserving every known remaining layer and using `completely nude` only when no known layer remains.
- Improve environmental image prompts, current-scene recovery, doorway resistance, and synchronization between generated photos and durable scene state.

### Performance and reliability

- Make initial mobile loading substantially faster, reduce long main-thread stalls, and smooth scrolling through earlier narrative responses.
- Improve Windows tray-service recovery, online-source startup behavior, profile retry errors, Ollama repetition recovery, and setup progress feedback.
- Document 12 GB of NVIDIA VRAM as the recommended minimum for the complete local workflow, with clear expectations for 8 GB, 16 GB, and 24 GB systems.
- Expand automated coverage for research quality, Narrative Mode, catalogue merging, scene transitions, wardrobe continuity, Windows packaging, and mobile-facing state.

## 0.4.0

### Adventures and scene continuity

- Give newly researched characters a character-specific first-contact adventure with a rerollable premise, world-appropriate contact method, opening line, and persistent initial scene.
- Generate an optional establishing image after an adventure begins without delaying the first conversation, and recover or retry that image if ComfyUI finishes after the browser disconnects.
- Track detailed surroundings separately from short location labels so later dialogue and images retain architecture, terrain, weather, room details, and lighting.
- Require real transition evidence before changing location, preventing activity associations such as air hockey from silently becoming an ice rink while still accepting a remote character's concrete report of their current activity and surroundings.
- Commit location, environment, activity, presence, and location ownership through one revisioned scene-transition reducer, preventing partial hybrid scenes and preparing the same state pipeline for a future narrative mode.

### Conversation reliability

- Check every character-search provider before showing the catalogue offline, send the required provider identification, tolerate ordinary response latency, and avoid caching temporary all-source failures.
- Add a token-aware context builder that budgets against the selected Ollama model's configured context window while preserving the newest exchanges, relevant memories, scene state, and core character identity.
- Improve action-only and substantive-turn grounding so valid replies are no longer replaced by repeated stock clarification messages.
- Keep explicit current-outfit descriptions authoritative and carry newly depicted photo outfits back into scene continuity without accepting vague wardrobe substitutions.

### Images and galleries

- Capture completed in-person wardrobe reveals automatically while continuing to wait through instructions, garment previews, and trips away to change.
- Wait for an outfit reveal when a character explicitly asks for time to change, rather than generating the old outfit in response to the initial request.
- Clean ANIMA prompts into stable character tags plus one concise natural-language scene, with better separation between identity, wardrobe, environment, activity, and framing.
- Keep conversational clauses out of destination labels and transition activities; omit repeated setting fallbacks and provide visible shoreline surroundings for beach scenes.
- Preserve the enclosing environment during relative movement such as swimming to the other side of a pool, and reject figurative room language as scenery.
- Make generated-image retries use current visual corrections and global prompt settings while preserving the intended historical scene.
- Recover moved or temporarily unavailable gallery files by stable ComfyUI filename, retry interrupted browser loads, and offer a clear regenerate action when an image is genuinely missing.

### Interface and sound

- Keep the mobile application anchored to the visible viewport when an iOS browser restores a stale outer-page scroll position after reopening the tab.
- Add pinned chats that remain above ordinary recency ordering on desktop and mobile.
- Add original, restrained sounds for sent and received messages, camera capture, completed photos, and major bond milestones, including selectable celebration and heartbeat cues.
- Refine Settings spacing, image diagnostics, mobile controls, placeholder typography, and opening-scene presentation.

## 0.3.2

### Independent character discovery

- Add an independent public character catalogue that covers anime, games, and other fictional characters without requiring AnimaDex.
- Merge duplicate search candidates, prefer confirmed series matches, hide obvious outfit variants from ordinary searches, and reject malformed catalogue names.
- Keep AnimaDex available only as an optional fallback source.
- Add recoverable setup controls so an incomplete first profile can be retried or removed instead of becoming a stuck chat.

### Character profiles and portraits

- Build stronger visual identity evidence from public metadata while filtering crowd-derived body proportions, vague age-coded filler, and conflicting attributes.
- Improve profile-build speed by using deterministic recovery before asking the profile model for a repair.
- Make generated contact portraits character-expressive, framing-aware, and resistant to bust/statue crops, low-angle framing, and incidental current-scene clothing.
- Preserve the strict adult-character rule while using ANIMA-friendly `1girl` or `1boy` prompt structure instead of the ambiguous `1person` token.

### Memory and continuity

- Retire completed promises and open loops in favor of their concrete outcomes so stale future-tense memories do not override events that already happened.
- Consolidate semantically duplicate memories across categories while preserving useful keywords and source references.
- Improve recent-context continuity for completed activities, outcomes, winners, and consequences.

### Images that follow the moment

- Replace the awkward picture-request shortcut with an in-scene camera capture that does not force characters to pretend they sent a photo.
- Recognize natural requests such as “let me see,” character photo claims, outfit reveals, arrivals, completed activities, and other key visual moments.
- Guarantee that a character who says they sent a current photo either queues that image or has the unsupported claim repaired.
- Extend contextual image reliability to guest chats while preserving separate solo images for each participant.
- Keep detailed, character-appropriate outfits stable across images until the scene establishes a clothing change, and omit footwear details when the framing will not show them.

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
