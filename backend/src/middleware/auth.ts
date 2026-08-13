import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors.js";
import { verifyToken } from "../utils.js";
import { queryOne } from "../db.js";

export type AuthUser = {
  id: string;
  email: string;
  full_name: string;
  role: "customer" | "reseller" | "admin";
  status: "active" | "suspended" | "pending";
};

export type ApiDeveloperContext = {
  id: string;
  user_id: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  plan: "free" | "reseller" | "premium";
  rate_limit_per_minute: number;
  allowed_ips: string[];
};

export type ApiKeyContext = {
  id: string;
  developer_id: string;
  name: string;
  key_prefix: string;
  status: "active" | "revoked" | "disabled";
  permissions: string[];
  allowed_ips: string[];
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      apiDeveloper?: ApiDeveloperContext;
      apiKey?: ApiKeyContext;
      apiRequestId?: string;
      apiPermission?: string;
    }
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readToken(req);
    if (!token) return next();
    const payload = verifyToken(token);
    const user = await queryOne<AuthUser>(
      `SELECT id, email, full_name, role, status FROM users WHERE id = $1`,
      [payload.id]
    );
    if (user && user.status === "active") req.user = user;
    next();
  } catch {
    next();
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readToken(req);
    if (!token) throw new AppError("Authentication required", 401);
    const payload = verifyToken(token);
    const user = await queryOne<AuthUser>(
      `SELECT id, email, full_name, role, status FROM users WHERE id = $1`,
      [payload.id]
    );
    if (!user) throw new AppError("Account not found", 401);
    if (user.status === "suspended") throw new AppError("Account is suspended", 403);
    if (user.status !== "active") throw new AppError("Account is not active", 403);
    req.user = user;
    next();
  } catch (error) {
    next(error instanceof AppError ? error : new AppError("Invalid or expired session", 401));
  }
}

export function requireRole(...roles: AuthUser["role"][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError("Authentication required", 401));
    if (!roles.includes(req.user.role)) {
      return next(new AppError("You do not have permission to perform this action", 403));
    }
    next();
  };
}

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookie = req.cookies?.lwh_token;
  return cookie || null;
}
