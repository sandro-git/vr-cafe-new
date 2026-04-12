import { defineQuery } from "groq";

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
