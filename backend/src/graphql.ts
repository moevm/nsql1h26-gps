
import typeDefs from "../schema.gql" with { type: "text" }
import { Neo4jGraphQL } from "@neo4j/graphql";
import neo4j from "neo4j-driver"
import config from "../config";

const dbUri = `bolt://${config.NEO4J_HOST}:${config.NEO4J_PORT}`

const driver = neo4j.driver(dbUri, neo4j.auth.basic(config.NEO4J_USER, config.NEO4J_PASSWORD))
const neoSchema = new Neo4jGraphQL({ typeDefs, driver })

const schema = await neoSchema.getSchema()

export { schema }