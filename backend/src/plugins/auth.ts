import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import config from "../../config";
import { AppError } from "../common/errors";

export interface AuthContext {
  userId: number;
  kind: "user" | "admin";
}

export const authPlugin = new Elysia({ name: "auth" })
  .use(jwt({ name: "jwt", secret: config.AUTH_SECRET, exp: config.JWT_TTL }))
  .derive({ as: "global" }, async ({ jwt, headers }): Promise<{ auth: AuthContext | null }> => {
    const token = (headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return { auth: null };
    const payload = await jwt.verify(token);
    const userId = payload ? Number(payload.sub) : NaN;
    if (!payload || !Number.isInteger(userId) || (payload.kind !== "user" && payload.kind !== "admin")) {
      return { auth: null };
    }
    return { auth: { userId, kind: payload.kind } };
  });

export function requireAuth(kind: "user" | "admin") {
  return ({ auth }: { auth: AuthContext | null }) => {
    if (!auth) throw new AppError(401, "AUTH_REQUIRED", "authentication required");
    if (auth.kind !== kind) throw new AppError(403, "FORBIDDEN", "forbidden");
  };
}

const USER_PATHS = ["/me", "/quests", "/achievements", "/leaderboard", "/users", "/map", "/poi"];
const ADMIN_PUBLIC_PREFIX = "/admin/auth";

export function pathGuard({ path, auth }: { path: string; auth: AuthContext | null }) {
  if (path.startsWith("/admin") && !path.startsWith(ADMIN_PUBLIC_PREFIX)) {
    if (!auth) throw new AppError(401, "AUTH_REQUIRED", "authentication required");
    if (auth.kind !== "admin") throw new AppError(403, "FORBIDDEN", "forbidden");
  }
  if (USER_PATHS.some((p) => path.startsWith(p))) {
    if (!auth) throw new AppError(401, "AUTH_REQUIRED", "authentication required");
    if (auth.kind !== "user") throw new AppError(403, "FORBIDDEN", "forbidden");
  }
}
