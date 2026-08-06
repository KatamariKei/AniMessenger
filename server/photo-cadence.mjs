function randomInt(min, max, random = Math.random) {
  const roll = Math.max(0, Math.min(0.999999, Number(random()) || 0));
  return min + Math.floor(roll * (max - min + 1));
}

export function photoCadenceRange(relationship) {
  const score = Math.max(0, Math.min(100, Number(relationship) || 0));
  if (score < 21) return null;
  if (score < 41) return [10, 15];
  if (score < 71) return [7, 12];
  return [5, 10];
}

export function advancePhotoCadence(current, relationship, random = Math.random) {
  const range = photoCadenceRange(relationship);
  if (!range) return { state: { turnsSincePhoto: 0, nextPhotoTurn: null }, opportunity: false };
  const turnsSincePhoto = Math.max(0, Math.trunc(Number(current?.turnsSincePhoto) || 0)) + 1;
  const savedTarget = Number(current?.nextPhotoTurn);
  const nextPhotoTurn = Number.isFinite(savedTarget) && savedTarget > 0
    ? Math.trunc(savedTarget)
    : randomInt(range[0], range[1], random);
  return {
    state: { turnsSincePhoto, nextPhotoTurn },
    opportunity: turnsSincePhoto >= nextPhotoTurn,
  };
}

export function postponePhotoCadence(current, random = Math.random) {
  const turnsSincePhoto = Math.max(0, Math.trunc(Number(current?.turnsSincePhoto) || 0));
  return { turnsSincePhoto, nextPhotoTurn: turnsSincePhoto + randomInt(1, 3, random) };
}

export function resetPhotoCadence(relationship, random = Math.random) {
  const range = photoCadenceRange(relationship);
  return {
    turnsSincePhoto: 0,
    nextPhotoTurn: range ? randomInt(range[0], range[1], random) : null,
  };
}
