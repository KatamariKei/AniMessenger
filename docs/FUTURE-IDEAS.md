# AniMessenger Future Ideas

This document tracks experimental work and intentionally deferred concepts.

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
