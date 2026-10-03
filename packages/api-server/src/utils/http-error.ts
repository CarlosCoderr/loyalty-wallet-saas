export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Recurso no encontrado') {
    super(404, message);
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Acceso denegado') {
    super(403, message);
  }
}

// Postgres 23505: violación de UNIQUE (Drizzle envuelve el error original en `cause`)
export function isUniqueViolation(err: unknown, constraint?: string) {
  const pg = ((err as { cause?: unknown })?.cause ?? err) as { code?: string; constraint_name?: string };
  return pg?.code === '23505' && (!constraint || pg.constraint_name === constraint);
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Credenciales inválidas') {
    super(401, message);
  }
}
