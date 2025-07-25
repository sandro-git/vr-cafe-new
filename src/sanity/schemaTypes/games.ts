
// ./src/sanity/schemaTypes/author.ts
import { defineField, defineType } from "sanity";

export const gamesTypes = defineType({
    name: "games",
    type: "document",
    fields: [
        defineField({
            name: "name",
            type: "string",
        }),
        defineField({
            name: "slug",
            type: "slug",
            options: {
                source: "name",
                maxLength: 96,
            },
        }),
        defineField({
            name: "image",
            type: "image",
            options: {
                hotspot: true,
            },
            fields: [
                {
                    name: "alt",
                    type: "string",
                    title: "Alternative Text",
                },
            ],
        }),
        defineField({
            name: "description",
            type: "array",
            of: [
                {
                    type: "block",
                    styles: [{ title: "Normal", value: "normal" }],
                    lists: [],
                },
            ],
        }),
    ],
    preview: {
        select: {
            title: "name",
            media: "image",
        },
    },
});