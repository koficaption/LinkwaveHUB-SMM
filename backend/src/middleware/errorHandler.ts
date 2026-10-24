import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodTypeAny } from "zod";
import { AppError, fail } from "../errors.js";
import { config } from "../config.js";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const v1 = typeof req.originalUrl === "string" && req.originalUrl.startsWith("/api/v1");

  if (err instanceof ZodError) {
    if (v1) {
      return res.status(422).json({
        success: false,
        error: {
          code: "validation_error",
          message: "Validation failed",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      });
    }
    return res.status(422).json(
      fail(
        "Validation failed",
        err.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
      )
    );
  }

  if (err instanceof AppError) {
    if (v1) {
      const message = err.status === 429 ? "Too many requests" : err.message;
      return res.status(err.status).json({
        success: false,
        error: { code: err.code || statusToCode(err.status), message },
      });
    }
    return res.status(err.status).json(fail(err.message, err.details));
  }

  console.error(err);
  const message = config.isProd ? "An unexpected error occurred" : (err as Error).message;
  if (v1) {
    return res.status(500).json({ success: false, error: { code: "server_error", message } });
  }
  return res.status(500).json(fail(message));
}

function statusToCode(status: number) {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "request_error";
}

export function validate(schema: ZodTypeAny, source: "body" | "query" | "params" = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req[source] = schema.parse(req[source]);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
