import { defineQuery } from "groq";

export const FAQS_QUERY = defineQuery(
  `*[_type == "faq"] | order(ordre asc) { question, reponse, categorie, ordre }`
);

export const GAME_PATHS_QUERY = defineQuery(`*[_type == "games"] { slug }`);

export const GAME_BY_SLUG_QUERY = defineQuery(`*[_type == "games" && slug.current == $slug][0]{
  name,
  description,
  youtubeLink,
  slug,
  image,
  tag->{name, title},
  players,
  duration,
  difficulty,
  age,
  tags[]->{title}
}`);

export const AVIS_QUERY = defineQuery(
  `*[_type == "avis" && afficher == true] | order(dateVisite desc) [0...12] {
    prenom, note, commentaire, dateVisite
  }`
);

export const TARIF_ANNIVERSAIRE_QUERY = defineQuery(
  `*[_type == "tarif" && type == "anniversaire"][0] { _id, name, prix, features }`
);

export const CONFIG_QUERY = defineQuery(
  `*[_type == "config"][0]{ noteGoogle, nombreAvis, lienGoogleMaps }`
);

/** Forme commune des 4 requêtes "jeux par tag" ci-dessous (jeuxVR/escapeGame/freeroaming/escapeFreeroaming). */
export type GameListItem = {
  name: string | null;
  description: string | null;
  image: { alt: string | null; asset: { url: string | null } | null } | null;
  tag: { name: string | null; title: string | null } | null;
  players: string | null;
  duration: string | null;
  slug: { current: string } | null;
};

export const GAMES_BY_TAG_QUERY = defineQuery(`*[_type == "games" && tag->title == $tagTitle]{
  name,
  description,
  image{
    alt,
    asset->{url}
  },
  tag->{name, title},
  players,
  duration,
  slug
}`);
