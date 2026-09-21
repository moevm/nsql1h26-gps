import { Elysia, t } from "elysia";
import { exportDump, importDump, parseDump } from "../../../common/dump";
import { logEvent } from "../../../common/log";
import { db } from "../../../common/db";

const exportSchema = t.Object({
  format: t.Literal("json"),
  scope: t.Optional(t.Array(t.String())),
  dateRange: t.Optional(t.Object({ from: t.String(), to: t.String() })),
});

export const adminDataModule = new Elysia({ name: "admin-data" })
    .post(
    "/admin/data/export",
    async ({ body }) => {
      const dump = await exportDump(db, {
        scope: body.scope,
        dateRange: body.dateRange,
      });
      await db.tx((tx) =>
        logEvent(tx, {
          type: "DATA_EXPORT",
          entityType: "System",
          priority: "High",
          description: `Graph export: ${dump.nodes.length} nodes, ${dump.relationships.length} relationships`,
          details: { nodes: dump.nodes.length, relationships: dump.relationships.length, scope: body.scope ?? null },
        }),
      );
      return new Response(JSON.stringify(dump, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="geogame-export-${new Date().toISOString().slice(0, 10)}.json"`,
        },
      });
    },
    { body: exportSchema },
  )
  .post(
    "/admin/data/import",
    async ({ body }) => {
      const raw = JSON.parse(await body.file.text()) as unknown;
      const dump = parseDump(raw);
      const { nodes, relationships } = await importDump(db, dump);
      await db.tx((tx) =>
        logEvent(tx, {
          type: "DATA_IMPORT",
          entityType: "System",
          priority: "High",
          description: `Graph import: ${nodes} nodes, ${relationships} relationships`,
          details: { nodes, relationships },
        }),
      );
      return { nodes, relationships };
    },
    { type: "multipart/form-data", body: t.Object({ file: t.File() }) },
  );
