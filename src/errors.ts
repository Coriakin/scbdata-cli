export class ScbDataError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = new.target.name;
    this.exitCode = exitCode;
  }
}

export class ValidationError extends ScbDataError {
  constructor(message: string) {
    super(message, 2);
  }
}

export class NotFoundError extends ScbDataError {
  constructor(message: string) {
    super(message, 3);
  }
}

export class AmbiguousResultError extends ScbDataError {
  constructor(message: string) {
    super(message, 4);
  }
}

export class RemoteSourceError extends ScbDataError {
  constructor(message: string) {
    super(message, 5);
  }
}
