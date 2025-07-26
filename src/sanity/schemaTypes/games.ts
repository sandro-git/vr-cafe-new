
// ./src/sanity/schemaTypes/author.ts
import { defineField, defineType } from "sanity";

export const gamesTypes = defineType({
    name: "games",
    type: "document",
    fields: [
        defineField({
            name: "name",
            type: "string",
            description: "Le nom du jeu",
        }),
        defineField({
            name: "slug",
            type: "slug",
            description: "Un identifiant unique pour le jeu, utilisé dans les URL",
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
                    description: "Important pour le SEO et l'accessibilité",
                },
            ],
        }),
        defineField({
            name: "youtubeLink",
            type: "text",
            description: "Le lien vers la bande-annonce YouTube du jeu",
            rows: 1,
        }),
        defineField({
            name: "description",
            type: "text",
            description: "Une brève description du jeu",
            rows: 8,
        }),
        defineField({
            name: "tag",
            type: "reference",
            description: "Le tag associé au jeu",
            to: { type: "tag" },
        }),
        defineField({
            name: "editeur",
            type: "reference",
            description: "L'éditeur associé au jeu",
            to: { type: "editeur" },
        }),
    ],
    preview: {
        select: {
            title: "name",
            media: "image",
        },
    },
});