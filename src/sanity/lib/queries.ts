import { defineQuery } from "groq";

export const FAQS_QUERY = defineQuery(
  `*[_type == "faq"] | order(ordre asc) { question, reponse, categorie, ordre }`
);

export const TARIFS_QUERY = defineQuery(
  `*[_type == "tarif"] | order(ordre asc) { _id, name, prix, description, isPromo, nbJoueurs, dureeMinutes }`
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

export const JEUX_VR_QUERY = defineQuery(`*[_type == "games" && tag->title == "jeuxVR"]{
  name,
  description,
  image{
    alt,
    asset->{url}
  },
  tag->{name},
  slug
}`);
