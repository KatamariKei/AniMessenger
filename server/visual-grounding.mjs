const normalize = value => String(value || "").toLowerCase().replaceAll("_", " ").replace(/\bblond\b/g, "blonde").replace(/\bgray\b/g, "grey").replace(/\s+/g, " ").trim();
const colors = "black|blonde|brown|blue|green|grey|orange|pink|purple|red|silver|white|aqua|yellow";
const colorTraits = text => [...normalize(text).matchAll(new RegExp(`\\b(${colors}) (hair|eyes)\\b`, "g"))].map(match => ({ group: match[2] === "hair" ? "hair color" : "eye color", trait: match[0] }));
const shapes = /\b(?:wolf cut|antenna hair|ahoge|ponytail|twintails|braids?|hair bun|two side up|hime cut|bald)\b/g;
const features = /\b(?:freckles|facial scar|heterochromia|glasses|eyepatch|horns|animal ears|scales|fur|wings|metallic body)\b/g;
const transient = /^(?:(?:a |an )?(?:determined|happy|sad|angry|calm|confident|natural|cheerful|serious|gentle|warm|neutral) (?:expression|smile|look)|smiling|looking (?:at|toward) (?:the )?(?:viewer|camera))$/i;

function traits(value) {
  const text = normalize(value);
  return [...colorTraits(text), ...[...text.matchAll(shapes)].map(match => ({ group: "hair shape", trait: match[0] })),
    ...[...text.matchAll(features)].map(match => ({ group: match[0], trait: match[0] }))];
}

function appearanceEvidence(character, dossier) {
  const facts = (dossier?.facts || []).filter(fact => fact.category === "appearance" && fact.scope !== "variant");
  const corroborated = character.imageIdentity?.postCount > 0 || character.sourceProvider === "danbooru";
  return { tags: corroborated ? (character?.tags || []).map(normalize) : [], facts: facts.map(fact => String(fact.quote || fact.claim || "")).join("\n") };
}

export function assessVisualGrounding(profile, character = {}, dossier = profile?.researchDossier) {
  const evidence = appearanceEvidence(character, dossier);
  const supported = new Set(traits([...evidence.tags, evidence.facts].join("\n")).map(item => item.trait));
  const present = traits([...(profile?.visual?.identity || []), ...(profile?.visual?.signature || [])].join("\n"));
  const groups = [...new Set(present.filter(item => supported.has(item.trait)).map(item => item.group))];
  return { status: groups.length >= 2 ? "supported" : "limited", supportedGroups: groups,
    sourceCount: (character.imageIdentity?.sourceUrl ? 1 : 0) + (dossier?.facts || []).filter(fact => fact.category === "appearance" && fact.scope !== "variant").reduce((sources, fact) => sources.add(fact.sourceId), new Set()).size };
}

export function groundVisualProfile(profile, character = {}, dossier = profile?.researchDossier) {
  if (!profile?.visual) return profile;
  const evidence = appearanceEvidence(character, dossier);
  let identity = (profile.visual.identity || []).filter(item => !transient.test(String(item).trim()));
  // Fill an unambiguous, reference-backed color gap. An explicit conflicting
  // appearance quote wins over aggregate image tags; never average two colors.
  for (const group of ["hair color", "eye color"]) {
    const candidates = [...new Set(colorTraits(evidence.tags.join("\n")).filter(item => item.group === group).map(item => item.trait))];
    const quoted = colorTraits(evidence.facts).filter(item => item.group === group);
    if (candidates.length !== 1 || quoted.some(item => item.trait !== candidates[0])) continue;
    const feature = group === "hair color" ? "hair" : "eyes";
    identity = identity.map(item => String(item).replace(new RegExp(`\\b(?:${colors})\\s+${feature}\\b`, "gi"), candidates[0]));
    if (!identity.some(item => normalize(item).includes(candidates[0]))) identity.push(candidates[0]);
  }
  const next = { ...profile, visual: { ...profile.visual, identity } };
  next.visual.grounding = assessVisualGrounding(next, character, dossier);
  return next;
}
