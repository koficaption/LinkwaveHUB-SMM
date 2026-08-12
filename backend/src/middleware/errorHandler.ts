import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodTypeAny } from "zod";
import { AppError, fail } from "../errors.js";
import { config } from "../config.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(422).json(
      fail(
        "Validation failed",
        err.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
      )
    );
  }

  if (err instanceof AppError) {
    return res.status(err.status).json(fail(err.message, err.details));
  }

  console.error(err);
  const message = config.isProd ? "An unexpected error occurred" : (err as Error).message;
  return res.status(500).json(fail(message));
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
