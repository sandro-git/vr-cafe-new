// ./src/sanity/schemaTypes/index.ts
import type { SchemaTypeDefinition } from "sanity";
import { gamesTypes } from "./games";

export const schema: { types: SchemaTypeDefinition[] } = {
    types: [gamesTypes],
};