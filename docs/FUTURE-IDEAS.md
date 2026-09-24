# AniMessenger Future Ideas

This document tracks experimental work and intentionally deferred concepts.

## Character-research waiting game

Offer a tiny optional tap-to-jump runner, inspired by Chrome's offline Dino game, while a new character is being researched and prepared. It should work with touch and keyboard, stay responsive without using the local AI/GPU budget, and stop or dismiss cleanly when the profile is ready or setup needs attention. Keep the real preparation progress and any error visible; the game is a diversion, not a substitute for status or a reason to prolong setup.

## Character revelations

Explore a lightweight revelations system that gives each character a small number of meaningful truths, topics, or personal discoveries that can emerge through the relationship. Revelations should create authored-feeling arcs without turning conversation into a checklist or trivia quiz.

### States

- **Unavailable:** The revelation cannot yet be reached. Required relationship, story, memory, or character-awareness conditions have not been met, and the model must not leak the answer.
- **Discoverable:** Fair clues and story conditions now exist. The user can notice a pattern, follow a lead, ask the right kind of question, or create a safe enough moment for the truth to emerge.
- **Revealed:** The truth has been meaningfully discovered or disclosed. It becomes durable continuity and can naturally affect later conversation, relationship behavior, and story choices.

### Fair discovery

Every revelation needs at least one understandable path into it: recurring behavior, a contradiction, an object, a memory fragment, a visible reaction, a related topic, a direct question, or a story event. A user should not need to guess an impossible secret or stumble over an invisible score threshold. Relationship level may help make a revelation available, but score alone should not reveal it.

The interface should preserve surprise without becoming opaque. An unavailable revelation can remain entirely hidden; a discoverable one might appear only as a subtle cue such as **Something remains unspoken**. The actual truth should never be spoiled by its label before it is revealed.

Some revelations are also self-discoveries. A character may not know the hidden truth yet, so the system must distinguish what the character currently understands from what the user has discovered. Rin's amnesia and alien origin are a useful test case: early on the truth is unavailable to both; later clues can make it discoverable; only an explicit recovered-memory event should make it known and discussable.

Revelations may grant a relationship bonus and a restrained milestone notification, but the reward size needs testing. The emotional consequence and durable continuity matter more than a large automatic score increase.

## Guest character cameos — current implementation

Temporary guest appearances are now implemented for one already-researched character inside an existing chat.

Example: the user and Misty go out for ramen, encounter Ash, and Ash joins the conversation for a while before leaving.

### Implemented experience

- The original character remains the host and owner of the chat.
- One researched guest may temporarily join.
- Guest messages have the guest's name, avatar, and distinct character voice.
- The guest uses the normal cached character profile and research system.
- The guest only knows the conversation from the point at which they entered.
- A visible event marks when the guest joins and leaves.
- Guests are selected from already-built private character profiles.
- The guest controls include **Open private chat**.
- Each participating character can gain relationship progress and durable memories without exposing their earlier private transcript.
- Ending an encounter writes a bounded shared-event memory to both private character records.
- An existing private relationship with the guest is preserved, without exposing private memories unprompted in front of the host.

### Performance approach

- Use the same loaded Ollama model; characters are separate profiles, not separate running models.
- Generate each speaker independently to prevent blended voices.
- Route most turns to one speaker and use two replies only when both genuinely have something to add.
- Use local routing rules instead of an additional director-model call on every turn.
- Keep one active guest maximum at first.
- Cache researched profiles.
- Summarize the encounter locally when the guest leaves.
- Do not run a persistent background guest simulation.

### Images

Either participant can send a solo image using their own profile. A request addressed to both queues two separate solo images. Both characters can independently inspect the same user attachment through the selected vision model. Multi-character compositions are not planned for the current design.

### Still deferred

- automatic character discovery or organic entrances;
- more than one simultaneous guest;
- persistent background guest simulation;
- proactive guest messages outside an active shared encounter.

### Multiverse collision continuity

Private chats currently behave as separate storylines. A deliberate guest encounter creates a temporary crossover, and only a bounded shared-event memory carries back afterward.

A future expanded mode could preserve explicit cross-timeline discoveries and contradictions without blending entire private histories. It would require character-specific knowledge provenance: who knew a fact before entering, who stated it during the crossover, who witnessed it, what remains unresolved, and what each participant is allowed to remember afterward. Relationship claims should remain attributed (for example, “Marie said she is dating the user”) rather than silently rewritten as universal truth.

This mode should be opt-in and should contain conflict through high-confidence facts, one contradiction at a time, no forced jealousy or reconciliation, and cooldowns that let the story move on. It is intentionally outside the current guest-chat polish scope.

### Success gates

- Host and guest maintain clearly distinct voices.
- Existing character quality, especially established profiles, remains unchanged.
- Existing thread files load without migration failures.
- A failed guest profile or response cannot interrupt the host chat.
- Restarting during a cameo has predictable recovery behavior.
- Normal one-speaker turns remain close to current response speed.

## Narrative mode

Explore an optional per-conversation toggle between the current **Chat mode** and a more story-forward **Narrative mode**.

Chat mode should remain the fast, messaging-first experience: direct character replies, occasional concise `[action: ...]` beats, and minimal prose. Narrative mode would add a third-person narrator that contributes restrained scene-setting, atmosphere, physical continuity, and emotional texture around the character dialogue. Its purpose is to give in-person scenes more color and depth without turning every exchange into a long-form novel.

### Intended experience

- Preserve the character's established profile, voice, relationship, memories, and current scene when switching modes.
- Present narration as a visually distinct story beat rather than putting narrator prose inside the character's chat bubble.
- Let narration describe the environment, pacing, observable behavior, and character feelings when they meaningfully deepen the scene.
- Never invent the user's private thoughts, feelings, dialogue, decisions, or physical actions.
- Keep narration selective and variable: sometimes one sentence is enough, and routine exchanges may need none.
- Allow the character's spoken dialogue to remain concise even when the narrator adds context.
- Keep generated images grounded in the same shared scene regardless of mode.
- Make switching back to Chat mode immediate and nondestructive.

### Questions to resolve

- Whether narration should be generated in the same Ollama response or by a separate lightweight pass.
- Whether the toggle applies per chat, per scene, or only until manually changed.
- How much access the narrator has to character interiority without over-explaining subtext.
- How narrated beats should be summarized and remembered without bloating the context window.
- How guest chats identify whose actions or feelings are being narrated.
- How to prevent repetitive purple prose, constant mood-setting, and narration that merely restates dialogue.

This should begin as an opt-in experiment. Existing chats must remain in Chat mode by default, and enabling it must not rewrite prior messages or alter established personalities.

### Post-release continuity hardening

The v0.5.0 continuity soak confirmed that explicit room moves and wardrobe changes are substantially more reliable, but natural-language scene state remains intentionally conservative and imperfect. A later pass should reject vague location labels such as `the warm place`, normalize durable locations separately from descriptive atmosphere, and expose a compact manual scene editor for correcting location, environment, presence, outfit, and pose without rewriting conversation history.

Add structured physical placement instead of asking image prompts to infer it from prose: posture (standing, sitting, lying, kneeling, crouching, or leaning), supporting surface, orientation, proximity, and relevant character-to-character placement. Persist that state until a completed movement changes it, track its source and confidence, and carry it into generated-image prompts so established seated or reclining scenes do not repeatedly default to standing portraits. Guest Narrative mode should eventually generate one unified ensemble passage with internal speaker attribution so both characters share coherent choreography while memories, relationships, outfits, and image state remain character-specific.

## Sound design

The first restrained sound layer is implemented with original procedural cues for messages sent and received, camera capture, completed character photos, and major relationship milestones. Settings provide a master switch, volume control, and previews; background proactive messages remain silent.

Possible later additions include:

- a quiet thinking or discovery texture while meeting and researching a new character;
- restrained completion and error sounds where they communicate something the user may not be looking at directly;
- optional per-category controls if the master switch proves too broad in real use.

Sounds should be short, cohesive with the AniMessenger brand, and used only when they add meaningful feedback. Provide a master sound toggle, sensible volume control, and optional per-category controls. Respect browser autoplay restrictions, device silent mode, reduced-motion or reduced-stimulation preferences where available, and avoid playing sounds for background proactive messages when doing so would be intrusive. The experience must remain completely understandable and usable with sound disabled.

## Moment Reels and local video generation

Explore an optional video experience that turns a meaningful established chat moment into a short, coherent scene rather than generating arbitrary background clips. A successful example is a character leading the user into a garden: the conversation already establishes the relationship, location, movement, mood, and visual reveal, while a storyboard turns that context into a deliberate multi-shot sequence for a capable local video model such as MiniMax H3.

### Intended experience

- Identify visually and emotionally meaningful moments without interrupting routine conversation.
- Let the user explicitly create a **Moment Reel** from an eligible message, generated image, or current scene.
- Build a concise, reviewable storyboard containing roughly three to five shots, with camera placement, movement, character action, continuity, and a final narrative beat.
- Carry the character identity lock, current outfit, location, lighting, relationship context, and latest visible evidence into every shot.
- Use an ANIMA image as an optional anchor or starting frame, then pass the approved scene plan to the selected local video workflow.
- Generate asynchronously so chat remains usable while video work is queued.
- Deliver the completed clip naturally into chat and retain it in the character gallery.
- Provide progress, cancellation, retry, storage management, and failed-generation recovery.

### Storyboard intelligence gap

High-quality multi-shot direction is its own reasoning problem. Current local chat models may produce an acceptable literal shot list while missing the pacing, visual escalation, continuity, camera language, and emotional composition available from a frontier planning model. Do not conceal this quality gap behind increasingly rigid prompt templates.

The eventual design should keep planning provider-agnostic:

- a fully local planner remains the private default and can improve as local models advance;
- an advanced user may select a stronger local model dedicated to storyboarding;
- a future opt-in frontier planner could produce only the storyboard while local ANIMA and video models perform all media generation;
- any hosted planning option must clearly disclose exactly what conversation and scene context leaves the device, require explicit consent, and never silently upload private chats or images;
- the storyboard should remain visible and editable before expensive generation begins.

Original characters offer the cleanest creative and distribution path. Existing fictional characters may work technically in a user's local workflow, but public-product licensing, identity consistency across shots, and adaptation-specific visual ambiguity require separate consideration.

### Performance and installation boundaries

- Treat video as an optional experimental pack, never a required AniMessenger dependency.
- Keep large model and workflow downloads outside the base installer.
- Detect model, node, disk, and VRAM requirements before exposing generation controls.
- Coordinate Ollama, ANIMA, and video-model GPU use through one queue rather than allowing them to compete unpredictably.
- Offer idle-only generation, power limits, pause/resume, and an explicit disable switch.
- Generate mobile-friendly previews while retaining the full local source file.
- Test the storyboard and rendering pipeline separately before integrating it into normal chat.

## Secure remote access

Allow a user to reach AniMessenger from their phone while away from the home network without publicly exposing local AI services.

### Product distinction

AniMessenger should present two separate controls:

- **Home Network Access:** Make the web interface available to devices on the same private Wi-Fi or LAN. This is equivalent to the current LAN mode.
- **Secure Remote Access:** Make AniMessenger available outside the home through an authenticated, encrypted private connection.

A ComfyUI-style network-listen option is not sufficient for secure remote access. Listening on all network interfaces does not provide authentication, HTTPS, NAT traversal, safe router configuration, or protection from public internet traffic.

### Recommended initial release approach

Offer an optional integration with [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve):

1. Detect whether Tailscale is installed and signed in.
2. Keep AniMessenger's backend, Ollama, and ComfyUI bound to localhost.
3. When the user enables **Secure Remote Access**, privately proxy only the AniMessenger web interface through Tailscale Serve.
4. Display the stable HTTPS address and a QR code for approved mobile devices.
5. Show clear connection health and authentication status.
6. Disable the Serve proxy when the user turns remote access off.

This approach avoids router port forwarding and limits access to authenticated devices in the user's private tailnet. It does require Tailscale on the host computer and remote device.

### Alternative providers and future architecture

- [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/) can create an outbound-only connection without opening inbound router ports. Paired with Cloudflare Access, it can enforce authentication, but its account and domain configuration are less consumer-friendly.
- Advanced users could configure their own authenticated reverse proxy.
- A future AniMessenger-owned service could use an outbound home connection, QR-code pairing, end-to-end encryption, and a relay or WebRTC connection. This would offer the smoothest experience but would require maintained signaling and relay infrastructure, authentication, abuse prevention, recovery flows, and bandwidth funding.

### Security boundaries

Never implement remote access by:

- automatically enabling router port forwarding or UPnP;
- publishing an unauthenticated public URL;
- exposing raw Vite, backend, Ollama, or ComfyUI ports;
- exposing local filesystem paths or configuration controls without authentication;
- assuming that a private-looking IP address is securely reachable over the internet.

Before remote access can be considered release-ready, AniMessenger should have:

- explicit device authentication and session revocation;
- HTTPS;
- rate limiting and request-size limits;
- origin and cross-site request protections;
- a protected Settings area, potentially requiring a local PIN;
- clear indicators showing whether remote access is on;
- predictable behavior when the PC sleeps, restarts, loses internet, or stops AniMessenger;
- a one-action emergency option to revoke all remote sessions.

### Performance expectations

Chat generation should remain dominated by local Ollama speed. Remote image delivery will depend on the home connection's upload speed, so thumbnails and appropriately sized previews should load before full-resolution files.

## Interface performance follow-up

Investigate stuttery or chunky scrolling reported on the Settings page on an RTX 3090 system. Profile the browser rendering path independently from Ollama and ComfyUI activity, with particular attention to fixed overlays, backdrop effects, large scrolling containers, and unnecessary repaints. Preserve the current visual design unless measurements identify a specific costly effect; this is a post-release optimization rather than a blocker for the current Windows build.
