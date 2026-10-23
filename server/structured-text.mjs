const camelCaseMetadata = /(?:,\s*)?["“”']?\s*(?:achievementSignals|sceneEvidence|relationshipDelta|shouldSendPhoto|photoBrief|photoOutfit|photoMessage|memoryCandidates|followUp|resolvesPendingFollowUp|otherShouldRespond)\s*["“”']?\s*:/i;
const quotedMetadata = /,\s*["“”']\s*(?:scene|reply|narration)\s*["“”']?\s*:/i;

function earliestMetadataIndex(value) {
  const indexes = [value.search(camelCaseMetadata), value.search(quotedMetadata)].filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function stripDanglingJsonDelimiter(value) {
  // A complete spoken sentence followed by a second quote and a JSON comma.
  // Only remove it when the surplus quote leaves straight quotes unbalanced;
  // valid nested quotations and ordinary dialogue commas remain untouched.
  if ((value.match(/"/g) || []).length % 2 === 0) return value;
  return value.replace(/([.!?…]")"\s*,\s*$/, "$1");
}

/**
 * Removes an accidentally embedded JSON field tail from visible model prose.
 * Local models occasionally return valid outer JSON while swallowing the
 * beginning of the next field into reply/narration. This is a display and
 * history boundary only; ordinary prose is otherwise left untouched.
 */
export function stripStructuredMetadataLeak(input = "") {
  const value = String(input || "").trim();
  const index = earliestMetadataIndex(value);
  if (index < 0) return stripDanglingJsonDelimiter(value);
  let clean = value.slice(0, index).replace(/[\s,;:]+$/g, "").trimEnd();
  if (!clean) return "";

  // If the swallowed JSON field also consumed the closing quotation mark of
  // the character's final spoken line, finish that line cleanly.
  const straightQuotes = (clean.match(/"/g) || []).length;
  if (!/[.!?…]$/.test(clean)) clean += ".";
  if (straightQuotes % 2) {
    clean += '"';
  }
  return clean;
}

