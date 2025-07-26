// ./src/sanity/schemaTypes/index.ts
import type { SchemaTypeDefinition } from "sanity";
import { gamesTypes } from "./games";
import { tagTypes } from "./tag";
import { editeurTypes } from "./editeur";

export const schema: { types: SchemaTypeDefinition[] } = {
    types: [gamesTypes, tagTypes, editeurTypes],
};