# Character research and creation redesign

Status: proposed architecture after code audit, September 10, 2026. This document does not change the running creation pipeline.

## First implementation checkpoint

Implemented source diagnostics, retained passages, concurrent providers, initial franchise-wiki routing, quote-backed dossier extraction, a source comparison pass with one bounded factual repair, and five server-reported creation stages with elapsed time. New researched builds stop if no usable quoted facts are available. Existing profiles are not migrated automatically.

Read-only trials on the configured gemma4:31b model retrieved Erica, Rin, and Triss franchise evidence in approximately 0.3 seconds. Revised dossier passes took approximately 18 seconds each. A full isolated Erica profile took approximately 41 seconds and correctly identified her occupation, friendships, gender identity, and social personality. These are single-run observations, not latency guarantees or a full quality benchmark. All 335 automated tests and the production build passed.

Remaining limitations: narrow franchise coverage; subjective claim interpretation can still fail despite an exact quote; timeline scopes are not yet reliable enough to enforce automatically; progress is process-local and does not survive a backend restart; the existing large performance schema remains; no automatic migration or research-edit UI yet. Broader held-out trials, better version/knowledge handling, and a smaller synthesis schema remain necessary before release.

## Objective

Create recognizable, coherent characters whose identity, role, relationships, appearance, and behavior follow supported canon. Preserve creative freedom for the user's adventure while making unsupported research visibly uncertain. Improve general results rather than accumulating character-specific fixes.

## Findings in the current implementation

- `server/research.mjs` collects catalogue notes, up to three Wikipedia extracts, and a single AniList character record. It does not perform general web search or deliberately retrieve Fandom, independent franchise wikis, or official character pages. Earlier descriptions that it could discover Fandom through general web search were inaccurate.
- Wikipedia relevance uses overlapping words rather than resolved identity. If no pages pass its relevance filter, it accepts the original pages anyway. A non-success Wikipedia HTTP response returns from the entire function and skips AniList; an exception does not. This inconsistent failure handling reduces coverage.
- Catalogue references are included in the final source list even when no substantial evidence was retrieved from the linked page. Sources are not connected to individual claims. A bibliography is therefore not proof that generated facts came from those pages.
- Catalogue merging unions notes and visual tags. Enrichment searches with a result limit of one before checking identity compatibility, potentially missing a correct lower-ranked match. Adaptation and timeline identity are not first-class records.
- `buildCharacterProfile` asks one call to produce canon, appearance, identity, present activity, and a large psychological/performance guide. Evidence may be thin while the schema requires extensive detail. This encourages plausible filler, particularly invented insecurities, motives, competencies, and relationships.
- `profileQualityIssues` mainly checks field completeness, counts, and speaking-style rules. It does not test factual agreement. The repair pass receives the draft and its derived canon, but no original evidence, and explicitly avoids rewriting core personality or canon. An erroneous premise can survive and gain detail.
- Research is concatenated as large extracts rather than budgeted around relevant character evidence. The generation reserves up to 6,000 output tokens, with another repair pass possible. Actual input/output usage and truncation need measurement before blaming any one model or context size.
- Profiles store final prose and source URLs, not retrieved evidence, claim provenance, conflicts, or research quality. This prevents a reliable retrospective explanation of exactly why Erica's original output failed.
- First-contact generation uses the summary, early history, traits, voice, and visuals but does not receive an explicit current-knowledge boundary. Chat receives broad canon/history as well. Late reveals can become immediate behavior, as happened with Rin.
- Cached profiles are reused without a research-quality check. Forced rebuilding explicitly preserves visual overrides; equivalent protection for user edits to biography and behavior needs design.
- Existing research tests cover two AniList identity cases, not Wikipedia fallback, source outages, factual grounding, spoiler boundaries, or coherent characterization.

Erica's saved draft contained an invented office career and manipulative socialite personality despite listing a character-specific Wikipedia page. Rin's draft turned a late revelation into ordinary self-reference and an analytical personality. These are confirmed output failures; the exact source payloads and model reasoning behind them were not retained.

## Proposed architecture

### 1. Resolve identity and version

Maintain a character identity record with provider IDs, aliases, franchise, adaptation, and selected era where relevant. Resolve same-name results before combining evidence. Keep versions distinct when they differ materially; choose a sensible default and ask one lightweight clarification only when necessary. Never merge a real person, unrelated namesake, or incompatible incarnation because of a shared word.

### 2. Retrieve a bounded evidence packet

Use independent source adapters with parallel requests, deadlines, caching, and explicit failure states. Failure at one provider must not suppress others.

Candidate sources include official character pages and manuals; detailed franchise wikis, including Fandom and independent sites; Wikipedia/Wikidata; AniList; and Danbooru for visual triggers and corroborating appearance. Prefer a directly relevant, substantive character page to several incidental mentions. Official promotional material can omit spoilers or detail, so rank evidence by both authority and usefulness for the particular claim.

Fandom integration requires real discovery and retrieval, not simply adding a URL to a bibliography. Prototype known-page retrieval and permitted APIs first; use identity-linked URLs, curated franchise mappings, or an explicitly selected search provider for discovery. Do not assume a free universal search API or bypass blocked access. General search-provider cost, availability, and installation requirements remain a decision to validate. Avoid generated character-chat pages and fanfiction as canonical sources.

Store source ID, URL, title, provider, retrieval outcome/time, character/version match, and bounded relevant passages. Preserve spoiler/section boundaries. Treat webpage content as evidence, never executable instructions. Arbitrary URL retrieval needs host validation, size/time limits, and protection against local-network targets.

### 3. Extract and reconcile facts before writing a persona

Build a small structured dossier: occupation, affiliations, identity/pronouns, age or uncertainty, relationships, history, competencies, observed behavioral patterns, visual appearance, and default wardrobe. Each substantive claim references supporting passage IDs and its scope/version. Mark supported, inferred, disputed, or unknown; confidence must reflect evidence, not just a model's self-rating.

Separate source canon from the app's adult adaptation and user customization. Keep canonical age uncertainty separate from a chosen adult portrayal; do not fabricate an exact canonical age to satisfy an integer field. Resolve conflicts by evidence and version. Preserve unresolved alternatives instead of silently blending them.

For visual research, distinguish natural appearance, habitual presentation, temporary outfits, and alternate designs. Frequent fan-art tags are useful visual evidence but weak support for personality, anatomy emphasis, or default wardrobe. Preserve the successful portrait generation path while improving the input dossier.

### 4. Compile a concise performance guide

Derive ordinary voice, motives, strengths, reactions under pressure, social behavior, and a few varied original example lines from the dossier. Label creative interpretation internally. Do not demand invented trauma, hidden ambition, five psychological themes, or a fixed number of vulnerabilities when the evidence cannot support them.

Keep identity and concrete role as stable anchors. Examples illustrate the supported voice; they do not establish new biography. Allow natural uncertainty, flaws, reserve, humor, and conflict. Reconcile chat and narrative presentation at runtime rather than rejecting physical characterization that narrative mode can use.

### 5. Validate against the evidence

Apply deterministic identity, schema, provenance-reference, and version checks, followed by a bounded factual review where needed. The reviewer must see original passages and identify unsupported or contradictory claims. Reusing the same model is not independent verification; deterministic checks, source evidence, and human evaluation remain essential.

Critical failures include wrong person, occupation, gender/pronouns, franchise, defining relationship, or incompatible version. Repair only the affected portion and cap retries. A rich but unsupported profile must not pass just because every array is filled. Sparse evidence may produce a clearly labeled limited draft, with retry or user correction; identity uncertainty should stop creation until resolved.

### 6. Give the adventure only appropriate current knowledge

Maintain researcher knowledge separately from the character's current awareness. Store a starting era/knowledge scope and expose only applicable facts to scenario and chat generation. Keep future revelations out of the active prompt where possible rather than repeatedly mentioning the secret alongside instructions to hide it.

This is foundational knowledge scoping, not implementation of the deferred Revelations game system. It should support that system later. Preserve facts already established in an existing chat; do not erase known history automatically during a profile update.

The scenario may invent a weather condition, meeting, or local problem within the selected world and character role. It must not invent a permanent career, replace relationships, or treat all endings as having happened. Opening images, chat, and profile should use the same accepted dossier and scenario state.

## User experience and corrections

Progress requirement: expose real server job stages and provider completion counts. Show source collection, evidence review, profile creation, and opening preparation with active/completed/error states and elapsed time. Model generation duration is variable, so an overall percentage must not pretend to measure token completion or time remaining. A stage-based progress bar can advance on completed work and display the active stage indeterminately. Reconnects should recover the same job status. Portrait generation should have its own optional status and should not hold completion at 99%. Record timings first, then consider calibrated estimates only when enough measurements exist.

- Retain the current search-to-scenario flow and letter avatars. Optional portrait generation remains asynchronous.
- Show understandable stages such as finding references, checking character details, and preparing the opening. Avoid fake percentage progress.
- Surface only meaningful uncertainty: for example, two conflicting versions or limited available research. Keep detailed sources accessible from the character sheet.
- Let users edit biography, behavior, and appearance and optionally provide a source URL. Record user edits separately with explicit precedence for their portrayal.
- Re-research should preview changed fields and preserve protected edits. Existing chats should not be silently rewritten or reset; offer a deliberate update with a concise explanation of changes.
- Save dossier, source snapshot, profile, and generation/version metadata separately so corrections can be diagnosed and reused. Cache by identity, version, source revision, and pipeline version.
- Original-character creation remains a distinct authored flow: user choices and creative generation are its evidence, without invented claims of external canon.

## Evaluation before rollout

Create reproducible source fixtures and a held-out character set, separate from manually corrected profiles. Include Erica and Rin; ambiguous Motoko adaptations; habitual versus natural appearance such as Marin; distinctive visual identities such as Maomao; video-game characters; aliases and spelling variants; obscure characters; unrelated namesakes; and original characters.

Evaluate role and identity accuracy, factual support, version consistency, personality recognizability, visual coherence, spoiler leakage, uncertainty handling, and source-outage behavior. Use several generations and short ordinary/tense/vulnerable conversations, not a single pleasing response. Record critical failures individually rather than hiding them in an average score.

Measure retrieval duration, prompt tokens, generated tokens, repair frequency, time until chat-ready, and cache benefit on both the 5090 and 3090. Hardware does not affect network-source completeness. Prefer a compact extraction plus synthesis pipeline, with targeted review/repair when required, over many mandatory large sequential generations.

Release gates: all deterministic identity/outage/provenance tests pass; no critical identity or role errors in the agreed fixture suite; substantial reduction in unsupported claims and caricature across held-out trials; no premature Rin-style disclosure; existing edits and chats survive; measured latency is acceptable to the user. These are bounded evaluation gates, not a promise of perfect canon for every character.

## Implementation milestones

1. Evidence foundation: fix retrieval fallthrough and relevance bugs, retain research diagnostics, define identity and source-passage schemas, and add outage/irrelevant-source fixtures.
2. Source coverage proof: retrieve substantive franchise-wiki evidence through the actual installed app path, test Fandom availability/fallbacks, and decide scalable discovery. Validate Catherine characters plus unrelated franchises before choosing the provider design.
3. Dossier and synthesis: extract supported facts, implement conflict/unknown handling, replace the oversized single-pass profile prompt, and compare results with the current pipeline in an isolated evaluation harness.
4. Current knowledge and user corrections: scope scenario/chat context, preserve editable fields, add re-research preview and migration behavior. Keep the full Revelations feature deferred.
5. Integrate after evaluation: enable for newly created characters first, test portraits/scenarios/chat together, then offer opt-in updates for existing profiles and ship with installer regression checks.

Recommended next implementation chunk: milestones 1 and 2, followed by an evidence-backed comparison of old versus proposed dossiers. Do not spend another round writing character-specific exceptions or expanding the existing prompt before verifying source delivery.
