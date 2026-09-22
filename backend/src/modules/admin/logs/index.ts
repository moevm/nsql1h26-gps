import { Elysia, t } from "elysia";
import { authPlugin } from "../../../plugins/auth";
import { AppError } from "../../../common/errors";
import { ENTITY_CONFIGS } from "../../../common/cypher/entity-configs";
import { makeAdminListRoutes, toDto } from "../../../common/cypher/list-route";
import { db } from "../../../common/db";

export const adminLogsModule = new Elysia({ name: "admin-logs" })
    .use(
    makeAdminListRoutes({
      prefix: "/admin/logs",
      cfg: ENTITY_CONFIGS.logs,
      detailCypher: `MATCH (e:EVENT_LOG {id: $id}) RETURN e`,
    }),
  )
  .get(
    "/admin/logs/:id/raw",
    async ({ params }) => {
      const rows = await db.run(`MATCH (e:EVENT_LOG {id: $id}) RETURN e`, { id: Number(params.id) });
      if (rows.length === 0) throw new AppError(404, "NOT_FOUND", "log not found");
      return toDto(rows[0]!);
    },
    { params: t.Object({ id: t.Numeric() }) },
  );
