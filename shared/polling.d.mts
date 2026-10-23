export type PollResult<T> = { status: "success"; value: T } | { status: "skipped" | "error" };
export function createRateLimitedPoller(options?: { minimumInterval?: number; maximumBackoff?: number; now?: () => number }): {
  run<T>(key: string, task: () => Promise<T>): Promise<PollResult<T>>;
};
export const notificationPoller: ReturnType<typeof createRateLimitedPoller>;
export const discoveryNotificationPoller: ReturnType<typeof createRateLimitedPoller>;
