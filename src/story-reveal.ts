export type StoryRevealState = {
  source: string;
  tokens: string[];
  cursor: number;
  nextAt?: number;
  streaming: boolean;
  skipped: boolean;
};

export const createStoryReveal = (): StoryRevealState => ({ source: "", tokens: [], cursor: 0, streaming: false, skipped: false });

export function updateStoryReveal(state: StoryRevealState, text: string, streaming: boolean, now: number) {
  const tokens = text.split(/(\s+)/).filter(Boolean);
  if (!text.startsWith(state.source)) {
    // Final validation can change paragraph spacing. Preserve already-read
    // words when they still match, but restart a genuinely replaced draft.
    const shown = state.tokens.slice(0, state.cursor).filter(token => !/^\s+$/.test(token));
    const words = tokens.filter(token => !/^\s+$/.test(token));
    if (shown.every((word, index) => words[index] === word)) {
      let count = 0;
      state.cursor = 0;
      while (state.cursor < tokens.length && count < shown.length) {
        if (!/^\s+$/.test(tokens[state.cursor])) count++;
        state.cursor++;
      }
      while (state.cursor < tokens.length && /^\s+$/.test(tokens[state.cursor])) state.cursor++;
    } else {
      state.cursor = 0; state.skipped = false; state.nextAt = now + 180;
    }
  }
  state.source = text; state.tokens = tokens; state.streaming = streaming;
  state.nextAt ??= now + 180;
}

export function advanceStoryReveal(state: StoryRevealState, now: number) {
  const { tokens } = state;
  // A streaming buffer can end halfway through a word. Wait for its boundary.
  const available = state.streaming && tokens.length && !/^\s+$/.test(tokens.at(-1)!) ? tokens.length - 1 : tokens.length;
  if (state.skipped) state.cursor = available;
  else if (state.cursor < available && now >= (state.nextAt ?? now)) {
    state.cursor++;
    const word = tokens[state.cursor - 1] || "";
    let space = "";
    while (state.cursor < available && /^\s+$/.test(tokens[state.cursor])) space += tokens[state.cursor++];
    const delay = space.includes("\n") ? 430 : /[.!?][”"']?$/.test(word) ? 320 : /[,;:][”"']?$/.test(word) ? 220 : 135;
    state.nextAt = now + delay;
  }
  return { visibleTokens: state.cursor, complete: !state.streaming && state.cursor >= tokens.length };
}
