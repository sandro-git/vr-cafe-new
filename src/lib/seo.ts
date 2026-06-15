// Helpers de données structurées (JSON-LD schema.org) partagés entre les pages.
// Chaque helper renvoie un nœud SANS @context ; assemblez-les avec graph().

export const SITE_URL = "https://vr-cafe.fr";
export const BUSINESS_ID = `${SITE_URL}/#business`;

type SchemaNode = Record<string, unknown>;

/** Nœud LocalBusiness/EntertainmentBusiness réutilisable (NAP + horaires). */
export const businessNode: SchemaNode = {
  "@type": ["EntertainmentBusiness", "LocalBusiness"],
  "@id": BUSINESS_ID,
  name: "VR Café",
  url: SITE_URL,
  image: `${SITE_URL}/og-image.jpg`,
  logo: `${SITE_URL}/android-chrome-512x512.png`,
  description:
    "Salle de réalité virtuelle à Canet-en-Roussillon, à 10 min de Perpignan : escape games VR, jeux multijoueurs et free roaming.",
  address: {
    "@type": "PostalAddress",
    streetAddress: "2 rue du Pilou",
    addressLocality: "Canet-en-Roussillon",
    postalCode: "66140",
    addressRegion: "Occitanie",
    addressCountry: "FR",
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: 42.7025,
    longitude: 3.0211,
  },
  telephone: "+33671410695",
  email: "contact@vr-cafe.fr",
  priceRange: "€€",
  hasMap:
    "https://maps.google.com/?q=VR+Café+2+rue+du+Pilou+66140+Canet-en-Roussillon",
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday"],
      opens: "14:00",
      closes: "20:00",
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Friday", "Saturday"],
      opens: "10:00",
      closes: "22:00",
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Sunday"],
      opens: "10:00",
      closes: "20:00",
    },
  ],
};

const AREA_SERVED = [
  { "@type": "City", name: "Perpignan" },
  { "@type": "City", name: "Canet-en-Roussillon" },
  { "@type": "AdministrativeArea", name: "Pyrénées-Orientales" },
];

/** Combine plusieurs nœuds dans un @graph avec un seul @context. */
export function graph(nodes: SchemaNode[]): SchemaNode {
  return { "@context": "https://schema.org", "@graph": nodes };
}

/** Fil d'Ariane. `items` : du plus général au plus spécifique. */
export function breadcrumb(
  items: { name: string; path: string }[],
): SchemaNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}

/** FAQPage à partir de paires question/réponse en texte brut. */
export function faqPage(
  faqs: { question: string; answer: string }[],
): SchemaNode {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

type Offer = { price: number; priceCurrency?: string; description?: string };

function toOffer(offer: Offer): SchemaNode {
  return {
    "@type": "Offer",
    price: offer.price,
    priceCurrency: offer.priceCurrency ?? "EUR",
    availability: "https://schema.org/InStock",
    url: `${SITE_URL}/reservation`,
    ...(offer.description ? { description: offer.description } : {}),
  };
}

/** Prestation (team building, anniversaire, EVG/EVJF…) rattachée au business. */
export function service(args: {
  name: string;
  description: string;
  serviceType: string;
  path: string;
  offer?: Offer;
}): SchemaNode {
  return {
    "@type": "Service",
    name: args.name,
    description: args.description,
    serviceType: args.serviceType,
    url: `${SITE_URL}${args.path}`,
    provider: { "@id": BUSINESS_ID },
    areaServed: AREA_SERVED,
    ...(args.offer ? { offers: toOffer(args.offer) } : {}),
  };
}

/** Produit (carte cadeau). */
export function product(args: {
  name: string;
  description: string;
  path: string;
  offer?: Offer;
}): SchemaNode {
  return {
    "@type": "Product",
    name: args.name,
    description: args.description,
    url: `${SITE_URL}${args.path}`,
    brand: { "@id": BUSINESS_ID },
    ...(args.offer ? { offers: toOffer(args.offer) } : {}),
  };
}

/** Liste ordonnée d'items (catalogue de jeux). */
export function itemList(
  items: { name: string; url: string }[],
): SchemaNode {
  return {
    "@type": "ItemList",
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: it.url,
    })),
  };
}

type GameLike = {
  name?: string | null;
  slug?: { current?: string | null } | null;
};

/** ItemList à partir d'un catalogue de jeux Sanity (lien vers la page détail). */
export function gameListSchema(games: GameLike[]): SchemaNode {
  return itemList(
    games
      .filter((g): g is GameLike & { slug: { current: string } } =>
        Boolean(g?.slug?.current),
      )
      .map((g) => ({
        name: g.name ?? "",
        url: `${SITE_URL}/${g.slug.current}`,
      })),
  );
}
