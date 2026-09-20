import { schema } from "./src/graphql";
import Elysia from "elysia";
import { openapi } from "@elysia/openapi"
import { apollo } from "@elysia/apollo"

new Elysia()
    .use(openapi())
    .use(apollo({ schema }))
    .listen(3000)