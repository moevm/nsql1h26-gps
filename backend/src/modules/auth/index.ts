import { Elysia, t } from "elysia";
import { AppError } from "../../common/errors";
import { nextId } from "../../common/ids";
import { authPlugin } from "../../plugins/auth";
import { db, type GraphClient } from "../../common/db";

const credentials = t.Object({
  username: t.String({ minLength: 3, maxLength: 30 }),
  password: t.String({ minLength: 6, maxLength: 128 }),
});

interface AuthOpts {
  label: "USER" | "ADMIN";
  kind: "user" | "admin";
  prefix: string;
}

export function makeAuthModule(opts: AuthOpts) {
  const isUser = opts.label === "USER";

  async function login(db: GraphClient, body: { username: string; password: string }) {
    const rows = await db.run(`MATCH (u:\`${opts.label}\` {username: $username}) RETURN u`, {
      username: body.username,
    });
    const node = rows[0]?.u as Record<string, unknown> | undefined;
    if (!node || !(await Bun.password.verify(body.password, node.password_hash as string))) {
      throw new AppError(401, "INVALID_CREDENTIALS", "invalid username or password");
    }
    if (isUser && node.status === "Banned") {
      throw new AppError(403, "BANNED", "user is banned");
    }
    return node;
  }

  async function register(db: GraphClient, body: { username: string; password: string }) {
    const password_hash = await Bun.password.hash(body.password);
    const now = new Date().toISOString();
    const fields = isUser
      ? {
          status: "Active",
          total_distance_km: 0,
          exp: 0,
              created_at: now,
          updated_at: now,
        }
      : { created_at: now };
    try {
      return await db.tx(async (tx) => {
        const id = await nextId(tx, opts.label);
        await tx.run(
          `CREATE (n:\`${opts.label}\` {id: $id, username: $username, password_hash: $password_hash})
           SET n += $fields
           RETURN n`,
          { id, username: body.username, password_hash, fields },
        );
        return { id, username: body.username, ...fields };
      });
    } catch (e) {
      if ((e as { code?: string })?.code === "Neo.ClientError.Schema.ConstraintValidationFailed") {
        throw new AppError(409, "USERNAME_TAKEN", "username is already taken");
      }
      throw e;
    }
  }

  return new Elysia({ name: `auth-${opts.kind}`, prefix: opts.prefix })
    .use(authPlugin)
    .post(
      "/login",
      async ({ body, jwt }) => {
        const node = await login(db, body);
        const token = await jwt.sign({ sub: String(node.id), kind: opts.kind });
        return { token, user: toAuthDto(node, isUser) };
      },
      { body: credentials },
    )
    .post(
      "/register",
      async ({ body, jwt }) => {
        const created = await register(db, body);
        const token = await jwt.sign({ sub: String(created.id), kind: opts.kind });
        return { token, user: toAuthDto(created, isUser) };
      },
      { body: credentials },
    );
}

export const userAuthModule = makeAuthModule({ label: "USER", kind: "user", prefix: "/auth" });

function toAuthDto(node: Record<string, unknown>, isUser: boolean): Record<string, unknown> {
  const { password_hash: _ph, password: _p, ...rest } = node;
  void _ph;
  void _p;
  if (isUser) {
    return {
      id: rest.id,
      username: rest.username,
      status: rest.status,
      avatar: rest.avatar ?? null,
      exp: rest.exp,
      total_distance_km: rest.total_distance_km,
      created_at: rest.created_at,
    };
  }
  return { id: rest.id, username: rest.username, created_at: rest.created_at };
}
