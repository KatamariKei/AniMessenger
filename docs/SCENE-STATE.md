# Scene state and transitions

AniMessenger treats a change of place as one scene event, not a set of unrelated field edits. This prevents impossible hybrids such as a kitchen location paired with bedroom surroundings or an arcade paired with ice-rink lighting.

## Authority

Scene transitions are resolved in this order:

1. an explicit current place or completed movement established by the user;
2. a deterministic arrival or presence cue, such as answering a visitor at the door;
3. another deterministic application cue;
4. a completed movement stated by the character;
5. a model-proposed location whose latest-turn evidence names and establishes that destination.

Plans, invitations, hypothetical movement, and semantic associations do not commit a location. "Let's go to the bedroom" is an intention. "We race to the bedroom and jump on the bed" is an arrival. Air hockey cannot become an ice rink merely because the activity resembles hockey.

## Atomic commit

An accepted transition updates the short location label, visible environment, current activity, physical presence, location owner, and scene revision as one transaction. If a model-proposed destination is rejected, its environment, activity, and lighting are rejected with it. Outfit and expression remain independently continuous unless the conversation establishes their change.

The environment must describe persistent visible surroundings. Movement, dialogue, pose, and action prose belong to activity or the conversation and cannot be saved as the environment.

Destination extraction retains unfamiliar place names and spatial qualifiers but stops before a new conversational clause. For example, "we arrive at the beach and she was right" establishes "the beach". Only an action following the destination can become the activity; commentary such as "it's completely private" does not override a model-provided activity. Image assembly also removes redundant setting fallbacks from older saved scenes.

Relative movement such as "race to the other side" or "reach the far end" retains the enclosing location and its environment. A model may update the current activity for that movement, but a relative label cannot replace the pool, room, or other established place. Figurative phrases such as "no room for error" are not physical surroundings.

## Remote and shared places

Legacy `scene.location` remains the active display and image location. New metadata distinguishes:

- `sharedLocation` when the user and character are together;
- `characterLocation` when the character is elsewhere;
- `userLocation` when the user reports moving independently;
- `locationOwner` to identify which of those the active location represents.

Existing threads migrate without a reset. A together scene becomes revision zero with a shared location; an apart scene becomes revision zero with a character location.

## Model and narrative integration

The newest authoritative user transition is applied before the chat model is called. The model therefore receives the destination as `CURRENT SCENE` and continues from it instead of trying to repair the prior scene afterward.

Future narrative output must enter this same reducer as scene events. A narrator may enrich surroundings and describe movement, but cannot directly mutate individual persisted fields or bypass transition authority. This keeps chat mode, proactive messages, guest scenes, images, and narrative mode on one continuity model.
