export default {
    AUTH_SECRET: process.env.AUTH_SECRET ?? "secret", 
    NEO4J_HOST: process.env.NEO4J_HOST ?? "localhost", 
    NEO4J_PORT: process.env.NEO4J_BOLT_PORT ?? process.env.NEO4J_PORT ?? "7687",
    NEO4J_USER: process.env.NEO4J_USER ?? "neo4j", 
    NEO4J_PASSWORD: process.env.NEO4J_PASSWORD ?? "password", 
}