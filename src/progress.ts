export interface ProgressReporter {
  runStep<T>(message: string, operation: () => Promise<T>): Promise<T>;
  info(message: string): void;
  complete(message?: string): void;
  fail(message: string): void;
}

export class TerminalProgressReporter implements ProgressReporter {
  private readonly isInteractive = Boolean(process.stderr.isTTY);
  private readonly frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private frameIndex = 0;
  private timer?: NodeJS.Timeout;
  private currentMessage = "";
  private rendered = false;

  async runStep<T>(message: string, operation: () => Promise<T>): Promise<T> {
    this.start(message);
    try {
      const result = await operation();
      this.succeed(message);
      return result;
    } catch (error) {
      this.fail(message);
      throw error;
    }
  }

  info(message: string): void {
    if (this.isInteractive) {
      this.clearLine();
      process.stderr.write(`ℹ ${message}\n`);
      if (this.currentMessage) {
        this.render();
      }
      return;
    }

    process.stderr.write(`${message}\n`);
  }

  complete(message = "Done"): void {
    if (this.currentMessage) {
      this.succeed(message);
      return;
    }
    process.stderr.write(`${this.isInteractive ? "✔ " : ""}${message}\n`);
  }

  fail(message: string): void {
    this.stopTimer();
    if (this.isInteractive) {
      this.clearLine();
      process.stderr.write(`✖ ${message}\n`);
      this.currentMessage = "";
      return;
    }

    process.stderr.write(`${message}\n`);
  }

  private start(message: string): void {
    this.stopTimer();
    this.currentMessage = message;

    if (!this.isInteractive) {
      process.stderr.write(`${message}...\n`);
      return;
    }

    this.frameIndex = 0;
    this.render();
    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.render();
    }, 80);
  }

  private succeed(message: string): void {
    this.stopTimer();

    if (this.isInteractive) {
      this.clearLine();
      process.stderr.write(`✔ ${message}\n`);
      this.currentMessage = "";
      return;
    }

    process.stderr.write(`${message}: ok\n`);
  }

  private render(): void {
    this.clearLine();
    process.stderr.write(`${this.frames[this.frameIndex]} ${this.currentMessage}`);
    this.rendered = true;
  }

  private clearLine(): void {
    if (!this.isInteractive || !this.rendered) {
      return;
    }
    process.stderr.write("\r\x1b[2K");
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

export class NoopProgressReporter implements ProgressReporter {
  async runStep<T>(_message: string, operation: () => Promise<T>): Promise<T> {
    return operation();
  }

  info(_message: string): void {}

  complete(_message?: string): void {}

  fail(_message: string): void {}
}
