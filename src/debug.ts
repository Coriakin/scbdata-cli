export interface DebugLogger {
  log(message: string): void;
}

export class StderrDebugLogger implements DebugLogger {
  constructor(private readonly enabled: boolean) {}

  log(message: string): void {
    if (!this.enabled) {
      return;
    }
    process.stderr.write(`[debug] ${message}\n`);
  }
}
