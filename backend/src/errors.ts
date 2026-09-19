export class AppError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status = 400, code?: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const ok = <T>(data: T, message = "Success") => ({
  success: true as const,
  message,
  data,
});

export const fail = (message: string, details?: unknown) => ({
  success: false as const,
  message,
  ...(details ? { details } : {}),
});
