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
  headsetType,
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

export const PARTENAIRES_QUERY = defineQuery(
  `*[_type == "editeur" && partenaireVedette == true && defined(logo)] | order(name asc) {
    name, siteUrl, logo
  }`
);

export const TARIF_ANNIVERSAIRE_QUERY = defineQuery(
  `*[_type == "tarif" && type == "anniversaire"][0] { _id, name, prix, features }`
);

export const CONFIG_QUERY = defineQuery(
  `*[_type == "config"][0]{ noteGoogle, nombreAvis, lienGoogleMaps }`
);

export type GameListItem = {
  name: string | null;
  description: string | null;
  image: { alt: string | null; asset: { url: string | null } | null } | null;
  tag: { name: string | null; title: string | null } | null;
  headsetType: "filaire" | "sans_fil" | null;
  players: string | null;
  duration: string | null;
  slug: { current: string } | null;
};

/** Tous les jeux du catalogue, utilisé par la page unifiée /experiences-vr avec ses filtres famille/mode. */
export const GAMES_ALL_QUERY = defineQuery(`*[_type == "games"] | order(name asc){
  name,
  description,
  image{
    alt,
    asset->{url}
  },
  tag->{name, title},
  headsetType,
  players,
  duration,
  slug
}`);

/** Lots actifs de la roue de récompense (/roue), triés dans l'ordre des segments. */
export const LOTS_ROUE_QUERY = defineQuery(
  `*[_type == "lotRoue" && actif == true] | order(ordre asc) { _id, label, poids, couleur, ordre }`
);

export type LotRoue = {
  _id: string;
  label: string;
  poids: number;
  couleur: string;
  ordre: number;
};
