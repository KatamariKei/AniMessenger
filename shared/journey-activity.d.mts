export type JourneyActivity = { observed: string; seen: string; unread: boolean };
export function journeyActivityFingerprint(journey: unknown, previousFingerprint?: string): string;
export function updateJourneyActivity(previous: JourneyActivity | null, fingerprint: string, viewed: boolean): JourneyActivity;
