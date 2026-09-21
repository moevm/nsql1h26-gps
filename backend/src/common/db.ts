import neo4j, { Driver, ManagedTransaction, Record as Neo4jRecord } from "neo4j-driver";
import config from "../../config";

export type Row = Record<string, unknown>;

export interface Tx {
  run(query: string, params?: Record<string, unknown>): Promise<Row[]>;
}

export interface GraphClient {
  run(query: string, params?: Record<string, unknown>): Promise<Row[]>;
  tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

const driver: Driver = neo4j.driver(
  `bolt://${config.NEO4J_HOST}:${config.NEO4J_PORT}`,
  neo4j.auth.basic(config.NEO4J_USER, config.NEO4J_PASSWORD),
  {
    disableLosslessIntegers: true, 
    maxConnectionPoolSize: 10,
    connectionAcquisitionTimeout: 10_000,
  },
);

const WRITE_HINT = /\b(create|merge|set|delete|remove|drop|call)\b/i;

function unwrapValue(x: unknown): unknown {
  if (x && typeof x === "object" && typeof (x as Record<string, unknown>).properties === "object") {
    const o = x as Record<string, unknown>;
    if (Array.isArray(o.labels) || typeof o.type === "string") return o.properties;
  }
  return x;
}

function toRows(records: Neo4jRecord[]): Row[] {
  return records.map((r) => {
    const obj = r.toObject();
    for (const k of Object.keys(obj)) obj[k] = unwrapValue(obj[k]);
    return obj;
  });
}

export const db: GraphClient = {
  async run(query, params) {
    const res = await driver.executeQuery(query, params, {
      routing: WRITE_HINT.test(query) ? neo4j.routing.WRITE : neo4j.routing.READ,
    });
    return toRows(res.records);
  },
  async tx(fn) {
    const session = driver.session();
    try {
      return await session.executeWrite(async (t: ManagedTransaction) =>
        fn({
          run: async (query, params) => toRows((await t.run(query, params)).records),
        }),
      );
    } finally {
      await session.close();
    }
  },
};

export async function withRetry<T>(fn: () => Promise<T>, attempts = 30, delayMs = 2000): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await Bun.sleep(delayMs);
    }
  }
  throw lastErr;
}
