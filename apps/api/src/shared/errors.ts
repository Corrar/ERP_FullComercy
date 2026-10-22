// src/shared/errors.ts — o vocabulário de erro da aplicação.
// Service lança `AppError`; o handler HTTP (shared/http.ts) traduz para status + JSON.
// Nada de `res.status(...)` dentro de service: service não sabe que HTTP existe.

export type AppErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'MODULE_INACTIVE'
  | 'MODULE_AMBIGUOUS'
  | 'STOCK_INSUFFICIENT'
  | 'INVALID_TRANSITION'
  | 'UNAVAILABLE'
  | 'INTERNAL';

const STATUS: Record<AppErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  MODULE_INACTIVE: 403,
  MODULE_AMBIGUOUS: 422,
  STOCK_INSUFFICIENT: 422,
  INVALID_TRANSITION: 422,
  UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = STATUS[code];
  }

  static notFound(what: string) {
    return new AppError('NOT_FOUND', `${what} não encontrado(a).`);
  }
  static validation(message: string, details?: unknown) {
    return new AppError('VALIDATION', message, details);
  }
  static forbidden(message = 'Acesso negado.') {
    return new AppError('FORBIDDEN', message);
  }
  static conflict(message: string) {
    return new AppError('CONFLICT', message);
  }
}
