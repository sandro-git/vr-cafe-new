import { defineField, defineType } from "sanity";

export const editeurTypes = defineType({
    name: "editeur",
    type: "document",
    fields: [
        defineField({
            name: "name",
            type: "string",
            description: "Le nom de l'éditeur",
        }),
    ],
    preview: {
        select: {
            title: "name",
        },
    },
});
