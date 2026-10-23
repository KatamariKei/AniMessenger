export function createDiscoveryDismissals(options?: {
  key?: string;
  storage?: Pick<Storage, "getItem" | "setItem">;
  now?: () => number;
  retryMs?: number;
}): {
  has(id: string): boolean;
  dismiss(threadId: string, id: string): void;
  flush(threadId: string, acknowledge: (threadId: string, id: string) => Promise<unknown>): Promise<void>;
};
