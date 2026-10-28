import { Prisma } from "#core/db";

// Expected failures carry a stable public code. Services throw these instead of
// HTTP helpers; the error handler maps the class to a status and `{ error: code }`.
// The message is the code itself, so nothing else can leak to a client.
export class AppError extends Error {
  readonly statusCode: number = 500;
  constructor(
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  override readonly statusCode = 400;
}
export class UnauthorizedError extends AppError {
  override readonly statusCode = 401;
}
export class ForbiddenError extends AppError {
  override readonly statusCode = 403;
}
export class NotFoundError extends AppError {
  override readonly statusCode = 404;
}
export class ConflictError extends AppError {
  override readonly statusCode = 409;
}
export class GoneError extends AppError {
  override readonly statusCode = 410;
}
export class PayloadTooLargeError extends AppError {
  override readonly statusCode = 413;
}
export class UnsupportedMediaTypeError extends AppError {
  override readonly statusCode = 415;
}
export class UnprocessableEntityError extends AppError {
  override readonly statusCode = 422;
}
export class ServiceUnavailableError extends AppError {
  override readonly statusCode = 503;
}

// Unique-constraint races are expected under concurrent idempotent writes.
export const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
