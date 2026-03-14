import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthUser {
  id: string;
  username: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// UUID v4 pattern — if the JWT sub doesn't match, it's a legacy GitHub numeric ID
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cache github_id → uuid lookups so we only hit DB once per session
const idCache = new Map<string, string>();

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      sub: string;
      username: string;
    };

    const sub = payload.sub;

    // If sub is already a UUID, use it directly
    if (UUID_RE.test(sub)) {
      req.user = { id: sub, username: payload.username };
      next();
      return;
    }

    // Legacy token: sub is a GitHub numeric ID — resolve to DB UUID
    const cached = idCache.get(sub);
    if (cached) {
      req.user = { id: cached, username: payload.username };
      next();
      return;
    }

    // Look up in DB
    import("./db.js").then(({ query }) =>
      query(`SELECT id FROM users WHERE github_id = $1`, [sub])
    ).then((result) => {
      if (result.rows.length > 0) {
        const dbId = result.rows[0].id;
        idCache.set(sub, dbId);
        req.user = { id: dbId, username: payload.username };
      } else {
        // No DB record — use the raw sub as fallback
        req.user = { id: sub, username: payload.username };
      }
      next();
    }).catch(() => {
      // DB unavailable — use raw sub
      req.user = { id: sub, username: payload.username };
      next();
    });
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
