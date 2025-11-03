
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
        defineField({
            name: "players",
            type: "string",
            description: "Nombre de joueurs (ex: '1 à 4')",
        }),
        defineField({
            name: "duration",
            type: "string",
            description: "Durée du jeu (ex: '60 min')",
        }),
        defineField({
            name: "difficulty",
            type: "number",
            description: "Difficulté du jeu (1-5)",
            validation: (Rule) => Rule.min(1).max(5),
        }),
        defineField({
            name: "age",
            type: "string",
            description: "Age conseillé (ex: '16+')",
        }),
        defineField({
            name: "tags",
            type: "array",
            description: "Tags du jeu pour le filtrage",
            of: [{ type: "reference", to: [{ type: "tag" }] }],
        }),
    ],
    preview: {
        select: {
            title: "name",
            media: "image",
        },
    },
});