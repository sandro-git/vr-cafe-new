import { defineField, defineType } from "sanity";

export const tagTypes = defineType({
    name: "tag",
    type: "document",
    fields: [
        defineField({
            name: "title",
            type: "string",
            description: "Le titre du tag",
        }),
    ],
    preview: {
        select: {
            title: "title",
        },
    },
});