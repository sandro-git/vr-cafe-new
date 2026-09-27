import { describe, expect, it } from "vitest";
import {
  BUSINESS_ID,
  SITE_URL,
  breadcrumb,
  businessNode,
  faqPage,
  gameListSchema,
  graph,
  itemList,
  product,
  service,
} from "../src/lib/seo";

describe("seo (JSON-LD)", () => {
  it("graph : un seul @context autour des nœuds", () => {
    expect(graph([businessNode])).toEqual({ "@context": "https://schema.org", "@graph": [businessNode] });
  });

  it("businessNode : coordonnées du café cohérentes", () => {
    expect(businessNode["@id"]).toBe(`${SITE_URL}/#business`);
    expect(businessNode.telephone).toBe("+33671410695");
    expect((businessNode.address as any).postalCode).toBe("66140");
    const jours = (businessNode.openingHoursSpecification as any[]).flatMap((h) => h.dayOfWeek);
    expect(jours.sort()).toEqual(["Friday", "Monday", "Saturday", "Sunday", "Thursday", "Tuesday", "Wednesday"]);
  });

  it("breadcrumb : positions à partir de 1 et URLs absolues", () => {
    const b = breadcrumb([{ name: "Accueil", path: "/" }, { name: "Anniversaire", path: "/anniversaire" }]);
    expect(b.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Accueil", item: "https://vr-cafe.fr/" },
      { "@type": "ListItem", position: 2, name: "Anniversaire", item: "https://vr-cafe.fr/anniversaire" },
    ]);
  });

  it("faqPage : questions/réponses", () => {
    const f = faqPage([{ question: "Âge minimum ?", answer: "8 ans." }]);
    expect(f.mainEntity).toEqual([
      { "@type": "Question", name: "Âge minimum ?", acceptedAnswer: { "@type": "Answer", text: "8 ans." } },
    ]);
  });

  it("service : rattaché au business, offre en EUR par défaut", () => {
    const s = service({
      name: "Anniversaire VR",
      description: "…",
      serviceType: "Anniversaire",
      path: "/anniversaire",
      offer: { price: 25, description: "par personne" },
    });
    expect(s.provider).toEqual({ "@id": BUSINESS_ID });
    expect(s.url).toBe("https://vr-cafe.fr/anniversaire");
    expect(s.offers).toMatchObject({ "@type": "Offer", price: 25, priceCurrency: "EUR", description: "par personne", url: "https://vr-cafe.fr/reservation" });
  });

  it("service/product sans offre : pas de clé offers", () => {
    expect(service({ name: "a", description: "b", serviceType: "c", path: "/x" })).not.toHaveProperty("offers");
    expect(product({ name: "Carte cadeau", description: "b", path: "/cadeaux" })).not.toHaveProperty("offers");
  });

  it("offre sans description : pas de clé description", () => {
    const p = product({ name: "Carte cadeau", description: "b", path: "/cadeaux", offer: { price: 30, priceCurrency: "USD" } });
    expect(p.offers).not.toHaveProperty("description");
    expect((p.offers as any).priceCurrency).toBe("USD");
    expect(p.brand).toEqual({ "@id": BUSINESS_ID });
  });

  it("itemList : compte et positions", () => {
    const l = itemList([{ name: "A", url: "u1" }, { name: "B", url: "u2" }]);
    expect(l.numberOfItems).toBe(2);
    expect((l.itemListElement as any[]).map((i) => i.position)).toEqual([1, 2]);
  });

  it("gameListSchema : ignore les jeux sans slug, nom vide par défaut", () => {
    const l = gameListSchema([
      { name: "Beat Saber", slug: { current: "beat-saber" } },
      { name: "Sans slug", slug: null },
      { name: "Slug vide", slug: { current: "" } },
      { name: null, slug: { current: "mystere" } },
    ]);
    expect(l.numberOfItems).toBe(2);
    expect(l.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Beat Saber", url: "https://vr-cafe.fr/beat-saber" },
      { "@type": "ListItem", position: 2, name: "", url: "https://vr-cafe.fr/mystere" },
    ]);
  });
});
