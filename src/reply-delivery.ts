// A delivery owns one cue, even when a provisional Story draft is replaced.
export function createReplyDelivery(mode: string | undefined, playArrival: () => void) {
  const story = mode === "story";
  let announced = false;
  const announce = () => {
    if (announced) return;
    announced = true;
    playArrival();
  };
  return {
    streamDrafts: story,
    firstVisible() { if (story) announce(); },
    delivered() { if (!story) announce(); },
  };
}
