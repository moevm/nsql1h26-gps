import { Neo4jGraphQL } from "@neo4j/graphql";
import neo4j from "neo4j-driver"
import { ApolloServer } from "apollo-server"

const typeDefs = await Bun.file("./schema.gql").text()
const driver = neo4j.driver("bolt://localhost:7687", neo4j.auth.basic("neo4j", "password"))
const neoSchema = new Neo4jGraphQL({ typeDefs, driver })

const schema = await neoSchema.getSchema()

const server = new ApolloServer({
    schema, 
    context: ({ req }) => ({ req }),
})

await server.listen(4000)
console.log("Online")