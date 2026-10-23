// Photo-only staging: never remove permanent eye identity from the profile.
export function eyeStateInText(text = "") {
  let state = "";
  const clauses = String(text).replaceAll("_", " ").split(/[.!?;]|\bbut\b/i);
  for (const clause of clauses) {
    if (/\b(?:tomorrow|later|will|would|might|could|plan to|going to|want to)\b/i.test(clause)) continue;
    const cues = /\b(?:eyes?\s+(?:fully\s+|completely\s+)?(?:closed|shut|open)|(?:closed|shut|open)\s+eyes?|(?:close|closes|closed|shut|shuts|open|opens|opened)\s+(?:(?:her|his|their|both)\s+)?eyes?|asleep|sleeping|awake|wakes? up)\b/gi;
    for (const match of clause.matchAll(cues)) {
      if (/\b(?:not|never|don't|doesn't|isn't|without)\s*$/i.test(clause.slice(0, match.index))) continue;
      state = /open|awake|wake/i.test(match[0]) ? "open" : "closed";
    }
  }
  return state;
}

export function imageEyeState(scene = {}, brief = "") {
  return eyeStateInText(brief) || eyeStateInText(scene.expression) || eyeStateInText(scene.activity);
}

export function withoutVisibleEyeDetails(text = "") {
  return String(text)
    .replace(/\b(?:eyes\s+(?:fully\s+|completely\s+)?open|open eyes)\b/gi, "")
    .replace(/\b(?:(?:bright|large|small|expressive|lively|calm|kind|direct|hesitant|sparkling|beautiful|wide|half-lidded|heterochromatic|two-tone|multicolored|blue|green|brown|hazel|grey|gray|red|purple|violet|golden|gold|yellow|amber|aqua|teal|pink|black|white|silver|orange|deep|dark|light|pale)\s+)+(?:eyes|irises)\b/gi, "")
    .replace(/\beyes\s+(?:are\s+)?(?:blue|green|brown|hazel|grey|gray|red|purple|violet|golden|yellow|amber|aqua|teal|pink|black|silver)\b/gi, "")
    .replace(/\b(?:looking at (?:the )?(?:viewer|camera)|direct gaze|eye contact|heterochromia)\b/gi, "")
    .replace(/\(\s*:\s*[\d.]+\s*\)/g, "")
    .replace(/,\s*,/g, ",").replace(/\s{2,}/g, " ").replace(/^[,\s]+|[,\s]+$/g, "");
}
