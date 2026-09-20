import { Neo4jGraphQL } from "@neo4j/graphql";
import neo4j from "neo4j-driver"
import { ApolloServer } from "apollo-server"
import config from "./config";

const dbUri = `bolt://${config.NEO4J_HOST}:${config.NEO4J_PORT}`

const typeDefs = await Bun.file("./schema.gql").text()
const driver = neo4j.driver(dbUri, neo4j.auth.basic(config.NEO4J_USER, config.NEO4J_PASSWORD))
const neoSchema = new Neo4jGraphQL({ typeDefs, driver })

const schema = await neoSchema.getSchema()

const server = new ApolloServer({
    schema, 
    context: ({ req }) => ({ req }),
})

await server.listen(4000)