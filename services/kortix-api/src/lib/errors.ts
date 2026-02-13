import { HTTPException } from 'hono/http-exception';

export class NotFoundError extends HTTPException {
  constructor(resource: string, id: string) {
    super(404, { message: `${resource} not found: ${id}` });
  }
}

export class ConflictError extends HTTPException {
  constructor(message: string) {
    super(409, { message });
  }
}

export class ValidationError extends HTTPException {
  constructor(message: string) {
    super(400, { message });
  }
}

export class ExecutionError extends Error {
  constructor(
    message: string,
    public readonly triggerId: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'ExecutionError';
  }
}
