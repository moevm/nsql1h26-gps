export default {
    PORT: Number(process.env.PORT ?? 8081),
    AUTH_SECRET: process.env.AUTH_SECRET ?? "secret",
    JWT_TTL: process.env.JWT_TTL ?? "7d",
    NEO4J_HOST: process.env.NEO4J_HOST ?? "localhost",
    NEO4J_PORT: Number(process.env.NEO4J_BOLT_PORT ?? process.env.NEO4J_PORT ?? "7687"),
    NEO4J_USER: process.env.NEO4J_USER ?? "neo4j",
    NEO4J_PASSWORD: process.env.NEO4J_PASSWORD ?? "password",
    SEED_FILE: process.env.SEED_FILE ?? "./seed/dump.json",
    UPLOADS_DIR: process.env.UPLOADS_DIR ?? "./data/uploads",
}
