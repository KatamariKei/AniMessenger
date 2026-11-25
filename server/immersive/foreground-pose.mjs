import { hasDifferentCurrentPlace } from '../scene-reconciliation.mjs';
import { evaluateSceneTurnV2 } from '../scene-events-v2.mjs';

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const narration = value => String(value || '').replace(/“[^”]*”|"[^"]*"/g, ' ');
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const speculative = /\b(?:almost|nearly|about to|might|would|could|will|wanted to|tried to|remembered|imagined|never|did not|didn['’]t)\b/i;
const expressionLead = /^(?:looks?|looked|seems?|seemed|appears?|appeared|is|was)\s+(?:(?:visibly|slightly|clearly|genuinely)\s+)?/i;
const fleetingReaction = /\b(?:briefly|fleeting|momentarily|for a (?:moment|second)|flicker|laugh(?:s|ed)?|chuckl(?:e[sd]?|ing))\b/i;
const expressions = [
  [/\b(?:confused|puzzled|perplexed|bewildered|furrow(?:s|ed|ing)? (?:her|his|their) brows?)\b/i, 'confused'],
  [/\b(?:surprised|startled|astonished|eyes widened)\b/i, 'surprised'],
  [/\b(?:amused|grinn(?:ed|ing))\b/i, 'amused'],
  [/\b(?:thoughtful|pensive|contemplative)\b/i, 'thoughtful'],
  [/^(?:beam(?:s|ed|ing)?|(?:gave|gives) (?:him |her |them )?a (?:bright|wide|joyful|radiant) smile)\b/i, 'a bright smile'],
  [/^(?:happy|delighted|joyful)\b/i, 'a bright smile'],
  [/^(?:serious|solemn|somber|sad|upset)\b/i, null],
  [/\bsmil(?:e[sd]?|ing)\b/i, 'smiling'],
];
const handGestures = [
  [/^(?:cross(?:es|ed|ing)?|fold(?:s|ed|ing)?)\s+(?:(?:her|his|their)\s+)?arms\b|^arms (?:crossed|folded)\b/i, 'arms crossed loosely', true],
  [/^(?:(?:puts?|putting|plac(?:e[sd]?|ing)|plant(?:s|ed|ing)?|rest(?:s|ed|ing)?)\s+(?:(?:her|his|their)\s+)?hands\s+on\s+(?:(?:her|his|their)\s+)?hips|hands on hips)\b/i, 'hands on hips', true],
  [/^(?:(?:puts?|putting|plac(?:e[sd]?|ing)|plant(?:s|ed|ing)?|rest(?:s|ed|ing)?)\s+(?:a|one|her|his|their)\s+hand\s+on\s+(?:her|his|their)\s+(?:(?:left|right)\s+)?hip|hand on (?:own )?hip)\b/i, 'hand on own hip', true],
  [/^(?:wav(?:e[sd]?|ing)|gave (?:a |one )?(?:small |quick )?wave)\b(?!\s+off\b)/i, 'waving', false],
  [/^shrug(?:s|ged|ging)?\b/i, 'a small shrug', false],
  [/^point(?:s|ed|ing)?\b/i, 'pointing', false],
  [/^(?:clasp(?:s|ed|ing)?|join(?:s|ed|ing)?)\s+(?:(?:her|his|their)\s+)?hands\b/i, 'hands loosely clasped', true],
  [/^(?:rais(?:e[sd]?|ing)|lift(?:s|ed|ing)?)\s+(?:(?:her|his|their|one|a)\s+)?hand\b/i, 'one hand raised', false],
  [/^(?:rest(?:s|ed|ing)?|set|placed)\s+(?:(?:her|his|their)\s+)?hands\s+(?:in|on)\s+(?:(?:her|his|their)\s+)?lap\b/i, 'hands resting in the lap', true],
];
const releasedHands = /^(?:(?:lower(?:s|ed|ing)?|drop(?:s|ped|ping)?|relax(?:es|ed|ing)?)\s+(?:(?:her|his|their|both|the raised)\s+)?(?:arms?|hands?)|uncross(?:es|ed|ing)?\s+(?:(?:her|his|their)\s+)?arms|stop(?:s|ped|ping)?\s+waving|(?:set(?:s|ting)?|put(?:s|ting)?|placed?)\s+(?:it|(?:the|a|her|his|their)\s+[^,]{1,40}?)\s+down|(?:set|sets|placed|places)\s+down\b)\b/i;
const prop = /^(?:(?:is|was|keeps?|kept|still)\s+)*(?:hold(?:s|ing)?|held|carrying|carr(?:ies|ied)|wield(?:s|ed|ing)?|grip(?:s|ped|ping)?|pick(?:s|ed|ing)? up|cup(?:s|ped|ping)?)\s+((?:(?:a|an|the|her|his|their)\s+)?(?:[\w-]+\s+){0,2}(?:mug|cup|glass|bottle|book|phone|tablet|umbrella|bag|bouquet|flowers|pen|pencil|notebook|remote|tool|basket|plate|bowl|tray|sword|staff))\b/i;
const headTilt = /^(?:tilt(?:s|ed|ing)?|cock(?:s|ed|ing)?)\s+(?:(?:her|his|their)\s+)?head\b/i;
const weightOnOneLeg = /^(?:contrapposto|(?:stand(?:s|ing)?|stood)\s+(?:in contrapposto|with (?:her|his|their) weight on one leg)|(?:shift(?:s|ed|ing)?|settl(?:e[sd]?|ing)|rest(?:s|ed|ing)?)\s+(?:(?:her|his|their)\s+)?weight\s+(?:on(?:to)?|to)\s+one leg)\b/i;
const assertiveBeat = /^(?:(?:scold|reprimand)(?:s|ed|ing)?|rebuk(?:e[sd]?|ing)|(?:stand(?:s|ing)?|stood) confidently|(?:looks?|looked|seems?|seemed|appears?|appeared)\s+(?:(?:visibly|clearly|genuinely)\s+)?(?:confident|self-assured)(?!\s+(?:that|about|in)\b))\b/i;
const laughterToSmile = /^as\s+(her|his|their)\s+(?:laughter|laugh|giggles?)\s+(?:subsid(?:e[sd]?|ing)|fad(?:e[sd]?|ing)|soften(?:s|ed|ing)?)\s+(?:into|to)\s+(?:a\s+)?(?:[\w-]+,?\s+){0,4}smile\b/i;
const laughter = /^(?:burst(?:s|ing)?\s+into\s+(?:[\w-]+\s+){0,6}laughter|laugh(?:s|ed|ing)?)\b/i;

function heldProp(action) {
  const match = action.match(prop);
  if (!match) return '';
  const item = match[1].replace(/^(?:a|an|the|her|his|their)\s+/i, '');
  if (/\b(?:my|your|their|his|her|our|someone|another)\b/i.test(item)) return '';
  const grip = /\b(?:both|two) hands\b/i.test(action) ? ' in both hands' :
    /\bone hand\b/i.test(action) ? ' in one hand' : '';
  return `holding the ${item.toLowerCase()}${grip}`;
}

function sameSceneMessages(messages, scene) {
  const recent = messages.slice(-12);
  const evidence = scene.locationEvidence;
  const checkpoint = evidence?.text ? recent.findLastIndex(message =>
    message.from === evidence.source &&
    clean(message.narration || message.text).toLowerCase().includes(clean(evidence.text).toLowerCase())) : -1;
  if (checkpoint >= 0) return recent.slice(checkpoint);
  const move = recent.findLastIndex(message => {
    const text = narration(message.narration || message.text);
    const turn = message.from === 'user' ? { userText: text } : { characterText: text };
    return evaluateSceneTurnV2(scene, turn).accepted.some(event =>
      event.actorIds.includes('character') && (event.kind === 'depart' || event.kind === 'arrive' &&
        hasDifferentCurrentPlace(scene, { latestExchange: { [message.from]: `in ${event.payload.label}` } })));
  });
  // Include the arrival reply so a gesture in that reply can establish the pose.
  return move >= 0 ? recent.slice(move) : recent;
}

export function foregroundPose(scene, messages, { characterName, pronouns, support, traits = [] }) {
  const name = clean(characterName).toLowerCase();
  const parts = name.split(' ');
  const aliases = [name, parts[0], parts.at(-1)].filter(part => part.length > 2 && !/^(?:princess|queen|king|lady|doctor)$/.test(part));
  const pronounGroup = { she: 'she', her: 'she', he: 'he', his: 'he', they: 'they', their: 'they' };
  const subjects = [...aliases.map(escapePattern), 'she', 'he', 'they', 'i', 'we', 'you', '(?:her|his|their)(?= +eyes)'];
  const subject = new RegExp(`^(?:${subjects.join('|')})(?=\\s)`, 'iu');
  const otherName = /^[\p{Lu}][\p{L}’'-]+(?=\s)/u;
  let narratorPronoun = pronounGroup[clean(pronouns).toLowerCase().match(/^(?:she|he|they)\b/)?.[0]];
  const recent = sameSceneMessages(messages, scene);
  const lastReply = recent.findLastIndex(message => message.from === 'character');
  let hands;
  let tilt = false;
  let expression = '';
  let laughed = false;
  let contrapposto = false;
  let assertive = false;
  for (const [index, message] of recent.entries()) {
    if (message.from === 'user' && index > lastReply) continue;
    const currentBeat = index === lastReply || message.from === 'user' && index === lastReply - 1;
    const sources = message.from === 'character' ? [message.narration] :
      [...String(message.text || '').matchAll(/\[action:\s*([^\]]*)\]/gi)].map(match => match[1]);
    for (const source of sources) {
      for (const sentence of narration(source).match(/[^.!?;]+[.!?;]?/g) || []) {
        if (sentence.endsWith('?')) continue;
        // An opening clause can describe the final expression before the main action.
        const smileOwner = sentence.trim().match(laughterToSmile)?.[1]?.toLowerCase();
        if (currentBeat && message.from === 'character' && smileOwner && pronounGroup[smileOwner] === narratorPronoun && !speculative.test(sentence)) {
          expression = 'a warm smile';
          assertive = false;
        }
        let host = false;
        for (const fragment of sentence.split(/\s*,\s*(?:(?:and|then|but)\s+)?|\s+(?:and then|and|then|but)\s+/i)) {
          let action = fragment.trim().replace(/[.!;]$/, '').replace(/^(?:slowly|gently|quickly|briefly|then|still)\s+/i, '');
          const actor = (action.match(subject)?.[0] || action.match(otherName)?.[0])?.toLowerCase();
          // Capitalized verbs after a conjunction are still continuations.
          if (actor && !handGestures.some(([pattern]) => pattern.test(action)) && !releasedHands.test(action) && !heldProp(action) && !headTilt.test(action) && !weightOnOneLeg.test(action) && !assertiveBeat.test(action)) {
            const actorPronoun = pronounGroup[actor];
            if (!narratorPronoun && message.from === 'character' && actorPronoun !== 'they') narratorPronoun = actorPronoun;
            host = aliases.includes(actor) || (message.from === 'character' && Boolean(actorPronoun) && actorPronoun === narratorPronoun);
            action = action.slice(actor.length).trim();
          }
          if (!host || speculative.test(action)) continue;
          action = action.replace(/^(?:slowly|gently|quickly|briefly|then|still)\s+/i, '');
          const holding = heldProp(action);
          const gesture = handGestures.find(([pattern]) => pattern.test(action));
          if (releasedHands.test(action)) hands = { cue: '', settled: currentBeat };
          else if (holding) hands = { cue: holding };
          else if (gesture) hands = { cue: currentBeat || gesture[2] ? gesture[1] : '' };
          if (currentBeat && headTilt.test(action)) tilt = true;
          if (currentBeat && laughter.test(action)) laughed = true;
          if (currentBeat && !fleetingReaction.test(fragment)) {
            if (weightOnOneLeg.test(action)) contrapposto = true;
            const cue = action.replace(expressionLead, '');
            const match = expressions.find(([pattern]) => cue.search(pattern) === 0);
            const beatExpression = match && (match[1] || cue.match(match[0])[0].toLowerCase());
            if (beatExpression) expression = beatExpression;
            if (beatExpression || assertiveBeat.test(action)) assertive = !beatExpression;
          }
        }
      }
    }
  }

  const savedExpression = clean(scene.expression);
  const mood = expression || expressions.find(([pattern]) => pattern.test(savedExpression))?.[1];
  const resting = scene.posture === 'lying' || /\b(?:sleeping|asleep)\b/i.test(scene.activity || '');
  const baseline = !resting && traits.some(trait => /^(?:cheerful|upbeat|bubbly|lighthearted)$/i.test(trait.trim())) ? 'a gentle smile' : '';
  const canGesture = !resting && !support && ['standing', 'seated'].includes(scene.posture);
  const activity = clean(scene.activity);
  const fallbackProp = heldProp(activity);
  if (!hands && fallbackProp) hands = { cue: fallbackProp };
  const savedGesture = handGestures.find(([pattern,, persistent]) => persistent && pattern.test(activity));
  if (!hands && savedGesture) hands = { cue: savedGesture[1] };
  let pose = hands?.cue;
  if (!pose && canGesture) {
    if (scene.posture === 'standing' && (contrapposto || weightOnOneLeg.test(activity))) pose = 'contrapposto';
    else if (!hands?.settled && scene.posture === 'standing' && assertive) pose = 'hands on hips';
    else if (!hands?.settled && mood === 'confused') pose = 'a small shrug';
    else if (!hands?.settled && mood === 'thoughtful') pose = 'hand on chin';
  }
  const head = tilt || !resting && mood === 'confused' ? 'slight head tilt' : '';
  return {
    direction: [pose, head].filter(Boolean).join(', '),
    expression: expression || (/^(?:natural expression|unspecified|unknown)$/i.test(savedExpression) ? '' : savedExpression)
      || (laughed ? 'smiling' : baseline || savedExpression),
  };
}
