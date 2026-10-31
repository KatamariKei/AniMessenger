# Changelog

## 0.6.1 — 2026-10-30

- Protect the local API with Host/origin checks and narrowly scoped browser access instead of wildcard CORS. This does not replace authenticated remote access.
- Save conversations, profiles, settings and image-job records atomically, retaining the previous valid file when a write or replacement fails. Serialize conversation updates against current state to preserve concurrent images/edits and prevent late work from recreating deleted chats.
- Replace quadratic history merging with linear membership checks and reject clear first-person Story narration outside quoted dialogue, using a bounded retry.
- Reduce avoidable chat preparation, research and prompt overhead; preserve relevant memories, personality instructions and inherited model context settings. Add bounded selected-model keep-alive and optional preparation before the first reply after idle.
- Stream Story prose with paced word reveal and received sound at the first visible text. Messaging delivers a completed, validated bubble and sound together. Preserve reading progress when streamed text becomes the saved reply.
- Reduce redundant foreground scene metadata while preserving exact evidence checks and separate image-scene verification.
- Improve room, posture, outfit and eye-state continuity. Reconcile uncertain current scenes before image generation, preserve grounded room checkpoints, and omit unsupported optional details instead of reusing stale actions or surroundings.
- Strengthen current-scene validation and stale-request checks across direct photos, automatic images and guest image preparation.
- Improve visual grounding using character-specific source evidence, with more reliable niche-character research and bounded source lookups.
- Resolve short character-catalogue aliases, recognize fan-created franchise descriptions and combine compatible research sources. Show catalogue descriptions/provider labels and preserve distinct characters when identity remains ambiguous.
- Keep existing chat/profile IDs on catalogue enrichment and give clearer missing-evidence guidance for fan-created characters. Research quality checks remain in place.

The bundled image model and recommended workflow remain unchanged. Performance and character/image consistency still depend on models, hardware and available evidence.

## 0.6.0 — 2026-10-22

- Share scroll-layer isolation and backdrop-filter removal between the user and character dossiers, keeping their rendering behavior consistent across tabs.

- Isolate the mounted character-dossier tab as an opaque scroll/paint layer, avoiding blending its scrolling content through the static portrait and rounded modal frame. Preserve content-driven scroll height and the existing desktop/mobile layout.

- Route Persona and Megami Tensei installments to the shared Megami Tensei wiki instead of guessed installment hosts. Remove full-screen background blur from the character dossier to reduce scrolling compositor work.

- Keep the existing bundled image model and recommended workflow unchanged.
- Copy shared application modules during Windows installation as well as packaging, so fresh installs and upgrades include Journey, achievements and memory support.
- Refine earlier-memory disclosures with smaller secondary typography and preserved keyboard focus styling.

- Simplify completed character discoveries to an “All 3 discoveries uncovered” message. Hide obsolete research, scan instructions and empty clues while preserving unlocked discovery cards and artwork controls.

- Accept explicit shared current-location declarations with posture wording even when the model repeats a stale location. Treat home/apartment wording as equivalent for evidenced whole-home arrivals without inventing specific rooms; continue rejecting planned, negated, hypothetical and remote-user moves.

- Replace capacity-based memory deletion with a searchable archive under the same saved collection. Preserve earlier memory wording/details, keep resolved commitments from being reopened by older scan evidence, and give historical scans the same explicit add/update/resolve schema, admission rules, current saved references and retention policy as live reviews. Show active/archive counts and earlier details in the memory UI; record scan changes in memory-health metrics.

- Give discovery celebrations priority over achievement popups. Confirm the discovery queue after detecting an award, wait for local dismissal, then leave a two-second quiet interval before showing and sounding the achievement celebration.

- Replace disagreement repair and recurring-tradition achievements with Time well spent (three different verified shared activities) and Getting to know you (three confirmed discoveries, including earlier chat), with matching editable vector icons. Preserve lifetime awards, deduplicate progress, and calculate discovery progress directly from source-confirmed discovery records.

- Keep proposed shared travel from falsely separating participants; preserve established shared-scene presence through the turn and ground proactive images in the saved scene instead of invented offscreen moves or outfit changes.

- Celebrate newly completed achievements with a dismissible, sound-aware popup and durable acknowledgement; bundle pending achievements, queue discoveries behind achievement celebrations, and keep preview backfill quiet.

- Activate one-time achievement point awards from verified progress, backfill already-reached preview targets without rewriting chats or bond, and show the persistent lifetime total and earned-achievement list in the user dossier. Character Journey shows only that character's points.

- Simplify the user identity to name, pronouns and observable appearance; remove About and the sharing toggle from the UI while excluding legacy interests from chat context. Add explicit local vision analysis of a chosen portrait with an editable suggestion, manual adoption and Save settings approval; never analyze portraits automatically.

- Match the user dossier to the character dossier's desktop dimensions, 44% portrait column and fixed square image framing. Generate user portraits through the same profile portrait request and standard image prompt builder, including studio scene, lighting, global prompts and anime rendering guidance rather than a separate positive-prompt override.

- Make generated user portraits primary, retain the editable portrait prompt with saved settings, share character-portrait gray studio art direction and global prompts, and remove portrait letterboxing from the user dossier.

- Redesign the user settings as a responsive personal dossier with Profile, Preferences and Setup tabs, stable save controls, portrait upload or local generation, and optional written identity details shared with characters only by explicit opt-in. Portraits are not analyzed automatically.

- Preserve character evidence following self-closing wiki references in both profile and discovery research, invalidate excerpts cached by the faulty cleaner, and explicitly scope casual/alternate accessories separately from the selected form's signature presentation.

- Route Fate and TYPE-MOON catalogue labels to the shared TYPE-MOON wiki, retaining selected-form qualifiers and existing source validation. Distinguish missing research passages from profile-model evidence extraction failures.

- Automatically queue discovery research after the opening scenario image completes, and on the first Journey visit for unprepared older characters. Reuse prepared discoveries, deduplicate jobs, retain manual retries and separate conversation rescans, and use the existing low-priority research queue.

- Route Vocaloid and Piapro/Piapro Studio character research to the shared Vocaloid wiki instead of guessing a nonexistent Piapro Studio community.

- Prefer verified shared-franchise wiki routes and parent-franchise catalogue aliases over installment-host guesses. Route Atelier installments to the shared Atelier wiki while retaining bounded lookups and character/continuity validation.

- Keep Scan chat directly accessible in the Memories tab even when no memories exist, rather than hiding recovery inside populated-only filters.

- Refine Journey activity alerts to ignore intermediate research, scan and artwork states while retaining alerts for completed results, new discoveries, verified progress and actionable failures. Track completed scan timestamps so repeated scans can notify even when no new discovery is found.

- Recover discovery artwork after ComfyUI loses a job or remains unreachable: show a retryable state, preserve the previous illustration, recheck history to avoid completion races, and prevent superseded jobs from overwriting newer artwork requests.

- Add a per-character Journey activity indicator for discovery/research/scan/artwork and achievement changes, persisted locally until Journey is opened. Accept whitespace-only differences in discovery evidence quotations while preserving literal source spans and rejecting changed words.

- Draft discoveries from code-copied source excerpts selected by evidence ID, retaining independent truth/awareness review instead of asking the model to reconstruct quotations. Reject shared-name wiki matches from the wrong installment, verify canonical-name aliases, and refresh mismatched cached discovery research.

- Normalize trailing catalogue `(Series)` labels for wiki routing, route Cyberpunk installments to the shared Cyberpunk wiki, and refresh cached discovery research when the franchise source previously failed or found no match.

- Retry transient Windows file locks when replacing memory-scan checkpoints, serialize saves per character, preserve the previous checkpoint on failure, clean up temporary files, and show a clear resumable error if a lock persists.

- Scan the complete saved conversation for historical memories instead of sampling at most 480 cue-selected messages. Split long messages without discarding their tails, bound each model packet, preserve source IDs, checkpoint successful batches for retry/resume after interruption, and yield between batches when chat or image work is active.

- Standardize discovery clues as short, actionable third-person observations, separate from suggested questions. Enforce the style in generation and review, reject dialogue/mechanical predictions, and support independently reviewed presentation-only repairs that preserve discovery facts, IDs, evidence and unlock history.

- Improve discovery research system-wide with balanced section coverage, a dedicated evidence budget that avoids profile excerpt truncation, up to nine source-validated candidates and independent selection of three diverse discoveries. Persist count-only rejection diagnostics and preserve existing definitions/unlocks during enrichment.

- Fix discovery popups remaining visible after dismissal: give the notification a distinct React sibling key from the message area. Reproduce and verify in the full app with simulated unlocks, delayed polling and offline acknowledgements; add bounded local-only diagnostic metadata and a key-collision regression guard.

- Remove a narrowly recognized dangling JSON quote/comma after completed dialogue when it leaves quotation marks unbalanced; preserve valid dialogue endings, nested quotes and ordinary prose punctuation.

- Generate discovery illustrations at their card's 16:9 aspect ratio (1280 × 720) with face-safe landscape framing, independently of normal chat image dimensions.

- Refine Journey into distinct Achievements, Discoveries and Bond milestone sections. Use compact tier-colored milestones with an expandable full list and tuck research/history controls into progressive disclosure. Add persistent unlock-specific discovery artwork generated from full revealed content, idle-time automatic creation for new live discoveries, on-demand creation for existing unlocks, regeneration, progress states and an accessible enlarged view; keep illustrations separate from chat and live scene continuity.

- Dismiss discovery notifications immediately while saving acknowledgement in the background, suppress in-flight duplicates, and restore a retryable notification on failure. Replace the close glyph with a geometrically centered SVG icon.

- Check complete narrative text for unfinished outfit reveals before committing character wardrobe evidence or queuing photos. Describing an ensemble and entering the fitting room to prepare it no longer counts as a completed change; returning in the new outfit remains eligible.

- Accept explicit current shared-location declarations as exact user evidence for the same model-proposed destination when copied model evidence is missing or invalid; exclude questions, future/hypothetical statements, and remote scenes.

- Recognize boutiques as valid destinations. Queue outfit photos from newly accepted current-scene clothing evidence rather than requiring a second matching reveal phrase, for both solo and guest turns; keep future plans, stale evidence, and profile-only changes from triggering this path.

- Capture shared destination candidates from established scene state and exact saved dialogue rather than model-written venue labels or fragile arrival wording. Keep independent semantic verification mandatory, distinguish provisional from verified prior visits, group booths/tables/dining rooms under their venue, and allow a later completed visit after an earlier uncertain plan. Add bounded rechecking of rejected destination samples without changing dialogue or enabling awards.

- Bound discovery notification traffic with a shared transport limiter that survives component remounts, deduplicates in-flight requests, enforces a ten-second minimum interval, and backs off failures to one minute. Remove focus-triggered checks, pause while hidden/profile viewing, and make unlock thread refreshes independent of sound availability and once-per-page per unlock.

- Stabilize the discovery popup on iOS by removing inherited backdrop blur, transformed animation, and translucent glow; use an opaque, statically positioned card instead. Guard the single popup instance and stale-poll dismissal suppression with regression checks.

- Celebrate live discoveries with a persistent, dismissible character popup showing the discovery title and +5 bond. Use the selected bond sound and sound-volume preferences, queue behind relationship popups, defer while hidden or viewing the profile, and persist acknowledgement locally so dismissed unlocks do not replay. Unacknowledged earlier live unlocks are picked up when their chat is opened; historical-scan matches do not trigger celebrations.

- Enable optional spoiler-safe discovery leads in Journey, explicit lead exploration, and conservative topic-scoped character self-knowledge. Verify live discoveries inside the existing background memory call using exact same-exchange evidence; preserve revealed knowledge, reject uncertain/guest-only matches, and grant new discoveries a durable one-time +5 bond bonus without changing achievement points. Earlier-chat recognition remains non-rewarding. Unseen answers stay out of public responses and unrelated chat prompts.

- Add an explicit local-model Check earlier chat action for prepared discoveries. Review bounded transcript batches between active work, require high-confidence same-exchange user/character evidence with exact quotations, exclude guest speakers, and save per-conversation confirmations without replacing definitions or granting rewards. Show spoiler-free progress and completion; interrupted/failed checks retain confirmed discoveries and can be retried.

- Add optional Research more for characters with fewer than three prepared discoveries. Refresh selected-character wiki evidence, prioritize backstory and relationships, and inspect bounded same-character detail pages. Independently review only new candidates; preserve all existing discovery IDs and answers, including when follow-up research fails.

- Begin optional character revelation enrichment with an explicit Prepare discoveries action in Journey. Queue preparation behind active work, generate up to three exact-source-backed selected-continuity discoveries, independently review grounding and distinctness, keep immutable answers in separate private storage, and expose status only. Sparse evidence does not invent replacements; profiles and chats are unchanged. Clue delivery, reveal detection, character-unaware discoveries, and one-time +5 bond rewards remain subsequent steps.

- Add a compact, responsive Journey tab with transparent achievement-preview status, five shared criteria, lifetime achievement-point totals, and earned bond milestones. Build a separate atomic local award ledger keyed by stable character/achievement identity, with concurrent retry protection, chat-recreation deduplication, corruption-safe failure, and source-free public projection. Keep live points and unlocks gated off while semantic shadow results are evaluated.

- Add independent semantic achievement review to the existing background memory request, bounded to four source-backed candidates. Require high-confidence support plus server-side evidence-chain checks, process prerequisites in transcript order, reject unknown/changed/duplicate review IDs, merge results atomically with current thread state, and leave all awards disabled. Provide count-only local diagnostics; never print private evidence or character topics.

- Extend achievement shadow tracking with persistent provisional evidence chains: shared final-destination checks and room grouping, distinct laughter exchanges, sincere user feelings, earlier disagreements followed by mutual repair, and agreed traditions with two explicitly distinct story occasions. Keep all candidates unawarded pending semantic review; isolate host/guest topic context and retain compact chains beyond the rolling diagnostic window.

- Add five shared achievement definitions and a bounded, private shadow evaluator to ordinary and guest conversations. Collect optional exact-source candidates in the existing reply call, screen unsupported/planned/wrong-participant evidence, preserve evaluation records against stale writes, and keep all rewards disabled pending semantic evaluation and destination/tradition deduplication.

- Begin relationship/discovery progression with shared ten-point tier labels from 20 through 100, score-preserving migration, a server-only bond score up to 200 while visible strength stays capped at 100, a one-time Soulbound milestone, durable tier records, retry deduplication, and protection against stale background saves. Preserve normal relationship behavior and photo/proactive cadence; achievements and three-character-revelation enrichment follow separately.
- Prevent duplicate development launches from overwriting the active service PID: check occupied service/web ports, claim tracking exclusively, recover stale markers, and only release a marker owned by the exiting process so tray status and restart remain reliable.
- Resolve eye staging for character photos: explicit photo direction overrides current scene cues, actual sleep and established closed eyes suppress visible eye-color/gaze tags and discourage open eyes, reopening restores normal identity details, and sleepy or future sleep plans do not force closure. Keep permanent profile identity unchanged and ask the chat model to preserve evidenced eye state in the current expression.
- Refine the character dossier with centered header controls, aligned mobile identity text, seamless tabs, one theme accent, a consistent sentence-case section hierarchy, and full desktop descriptions; offer mobile expansion only for genuinely clipped descriptions.
- Redesign the character page as a responsive, character-first dossier: a large bust-art showcase on desktop, a compact mobile banner, expandable voice/scene/appearance details, personality cues, and persistent editing/return actions. Keep Memories and Gallery tools intact, compact their mobile header, and reclaim space while the memory editor's mobile keyboard is open.
- Use an evidence-backed final scene from each chat/Narrative exchange rather than requiring legacy movement phrases to commit transitions. Validate exact current-source quotations, keep planned moves and user-only state separate, feed final posture into images, and retain bounded privacy-safe diagnostics across restarts.
- Begin the scene-continuity redesign with a typed V2 event evaluator that separates place arrivals, object interactions, and body posture; validates evidence and temporal status; imports legacy locations as provisional; records privacy-safe shadow comparisons; and uses the shared place validator to stop malformed object interactions from overwriting saved locations.
- Add an image-safe scene snapshot before every ANIMA prompt: malformed object/action locations are omitted, valid detailed surroundings survive, and unmistakable setting conflicts in photo directions cannot override the established scene.
- Reject leaked movement narration from image environments—even when it happens to name a room—and rebuild the visible surroundings from the validated location instead.
- Track sleeping, getting into bed, closed eyes, and support furniture as typed shadow scene facts; before this becomes image-authoritative, suppress eye-color prompt tags whenever fully closed eyes are established so the image model is not pulled toward reopening them.
- Resolve multiple posture changes in narrative order—including omitted repeated subjects such as “stood up … and sat back down”—and recognize returning to a lounger, so the final body position wins instead of a regex priority.
- Strip accidentally swallowed structured-response fields such as `relationshipDelta` from visible replies, narration, saved-message display, and subsequent model history while preserving the completed in-character prose before the leak.
- Normalize Japanese macron spellings into the romanized aliases expected by character catalogues and ANIMA, route Kill la Kill research through its franchise wiki, prevent unrelated appearance colors such as red hair from leaking into repaired outfits, and prefer a character's signature recurring costume over clothing confined to brief opening or ending appearances.
- Record per-stage character-creation timings for source research, evidence extraction, profile writing, validation, and the opening scene so performance work can target actual bottlenecks without weakening profile quality.
- Use a consistent bounded Ollama context for character-creation passes instead of allocating the model's 65K default when the complete grounded packet fits well below that limit, reducing VRAM pressure without trimming evidence or profile fields.
- Capture privacy-safe Ollama performance counters for each creation pass—prompt tokens, output tokens, loading, prompt evaluation, and generation time—without recording prompt or response content.
- Repair only the profile fields that fail deterministic quality checks instead of regenerating an otherwise complete persona guide, preserving the same quality requirements while avoiding broad duplicate output.
- Apply factual validation fixes as focused field replacements and re-review the complete result, falling back to a full-profile correction only when the smaller edit cannot clear a critical evidence issue.
- Combine profile-depth and factual corrections into one focused edit when both are present, retaining a targeted second repair only for fields that still fail quality checks.
- Cache fresh grounded character research by exact catalogue identity for seven days so retries and re-creations can reuse source evidence without confusing similarly named characters or continuities.
- Extract a more compact, non-repetitive evidence dossier with short exact quotations, preserving personality range and visual grounding while reducing avoidable model output.
- Increase mobile narration beats to 17px and full Narrative Mode passages to 18px for more comfortable long-form reading without changing ordinary chat typography.
- Consolidate differently worded promises, open loops, and their completed event into one evolving memory while keeping separate completed occasions distinct.
- Merge repeated completed-event summaries when they share source-message evidence, including legacy copies of the same distinctly named event, without collapsing separate dated occasions.
- Consolidate stable facts across an explicitly established user-name alias, preserve unresolved conflicting values, let manual corrections supersede them, and require honest uncertainty during conflicting recall.
- Consolidate differently worded summaries of the same nearby episode without collapsing distinct activities or protected milestones, and normalize written and numeric measurement values for stable-fact matching.
- Treat the 240-memory figure as an active-memory target: protect manual edits, facts, preferences, boundaries, creations, active commitments, and milestones while archiving lower-priority events rather than deleting them. Archives remain available for relevant recall; reject temporary “currently…” scene summaries before they enter long-term memory.
- Use confidence-gated semantic recall for weak lexical matches, expand natural relative-time cues, keep conflicting fact variants together, preserve semantic result order, and exclude undated lookalikes from first/last event recall.

AniMessenger is pre-release software. Changes may still adjust local data, model prompts, and installation behavior.

### Additional memory and continuity improvements

### Long-term memory

- Review every completed user/character exchange in the background instead of waiting for a longer session, guarantee explicit “remember that” requests and clearly stated favorites or allergies, and surface failed automatic reviews in the Memories tab instead of silently dropping them.
- Add a consistent 1–5 importance rubric plus synonym-aware, relative-time, first-event, and most-recent-event retrieval so natural paraphrases and questions such as “last week” or “the first time” resolve more reliably.
- Add a bounded model-assisted recall fallback for explicit memory questions whose wording shares no useful keywords with the saved event, while rejecting invented or unrelated memory IDs.
- Keep surrounding context when scanning long conversations, and deterministically recover completed jukebox/song episodes, so distinctive multi-turn moments—such as a first workplace visit and the songs chosen there—become one useful durable memory instead of disappearing between isolated keyword matches; hypothetical song plans remain excluded.
- Preserve exact source-message provenance and event dates during historical rescans, retain the fuller original episode when a later reminder overlaps it, and use the earliest grounded occurrence for event chronology.
- Require meaningful query overlap before injecting memories into a reply, and explicitly prefer honest uncertainty over a plausible guess when the saved record does not answer a recall question.
- Resolve recall only against the pre-turn memory snapshot so details repeated in the user's current message are treated as reminders, never retroactive proof that the character already remembered them.
- Improve live capture guidance for specific first visits, workplace interactions, named places, songs, activities, and other callback-worthy shared actions.
- Remove the topic blacklist that silently rejected intimate or sexual memories; meaningful events are now judged by durability and relationship relevance rather than censored vocabulary.
- Allow earlier chats to be rescanned after memory extraction improves, with clear feedback about newly recovered memories.
- Make large memory collections reviewable with text search, labeled category filters, recently-saved/newest-event/importance sorting, event dates, and visible filtered counts; keep the mobile controls touch-sized with high-contrast dropdown indicators and prevent iOS focus zoom.
- Let people add or correct memories directly, protect their edits from automatic extraction, and show the original chat messages behind automatically captured memories when those messages are still available.
- Add resumable post-reply memory checkpoints that review bounded multi-turn windows without delaying the visible response, retain source-message provenance and event time, and merge safely without overwriting a newer chat turn.
- Keep dated plans as unresolved story threads until the user explicitly completes, changes, or cancels them; elapsed real time never turns a plan into a completed event, missed deadline, broken promise, or relationship penalty.
- Make “Forget memory” durable across live extraction and historical rescans, while still allowing a manually added correction to replace the forgotten version.
- Replace older values when the user states a new value for the same named favorite, without retaining the obsolete value as a recall keyword; manual corrections remain authoritative.

### Scene continuity

- Keep future and hypothetical destinations—such as planning to visit the beach tomorrow—from replacing the character's current location, surroundings, activity, or lighting.
- Recognize completed wardrobe changes stated with the active character's name, so instructions such as “Erica put on her waitress uniform” override a prior unclothed state without affecting a guest's outfit.
- Recognize natural completed outfit narration such as “dressed for travel in something comfortable—a pair of denim shorts and a tank top,” preserving the full coordinated outfit instead of carrying forward stale clothing.

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
