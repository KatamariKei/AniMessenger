export function createDiscoveryDiagnostics(options?: { storage?: Storage; now?: () => number; limit?: number }): {
  record(event: string, detail?: Record<string, unknown>): void;
  read(): Record<string, unknown>[];
};
