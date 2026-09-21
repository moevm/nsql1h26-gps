import { Elysia, t } from "elysia";
import { db } from "../../common/db";
import { authPlugin } from "../../plugins/auth";

const SORT_FIELDS: Record<string, string> = {
  exp: "u.exp",
  distance: "u.total_distance_km",
};

export const leaderboardModule = new Elysia({ name: "leaderboard" })
  .use(authPlugin)
  .get(
    "/leaderboard",
    async ({ query, auth }) => {
      const sortBy = query.sortBy ?? "exp";
      const field = SORT_FIELDS[sortBy];
      if (!field) throw new Error("bad sortBy"); 
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      const offset = (page - 1) * pageSize;

      const [items, rankRows, totalRows] = await Promise.all([
        db.run(
          `MATCH (u:USER) WHERE u.status = 'Active'
           RETURN u.id AS id, u.username AS username, u.avatar AS avatar,
                  u.exp AS exp, u.total_distance_km AS distance
           ORDER BY ${field} DESC, u.username ASC
           SKIP ${offset} LIMIT ${pageSize}`,
        ),
        db.run(
          `MATCH (me:USER {id: $id}), (u:USER)
           WHERE u.status = 'Active' AND ${field} > me.\`${sortBy === "exp" ? "exp" : "total_distance_km"}\`
           RETURN count(u) + 1 AS rank`,
          { id: auth!.userId },
        ),
        db.run(`MATCH (u:USER) WHERE u.status = 'Active' RETURN count(u) AS total`),
      ]);

      return {
        items,
        rank: rankRows[0]?.rank ?? 1,
        total: totalRows[0]?.total ?? 0,
        page,
        pageSize,
        sortBy,
      };
    },
    {
      query: t.Object({
        sortBy: t.Optional(t.Union([t.Literal("exp"), t.Literal("distance")])),
        page: t.Optional(t.Number({ minimum: 1 })),
        pageSize: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
    },
  );
