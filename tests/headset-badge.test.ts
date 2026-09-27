import { describe, expect, it } from "vitest";
import { HEADSET_LABELS, headsetBadgeHtml } from "../src/lib/headsetBadge";

describe("headsetBadgeHtml", () => {
  it("affiche le libellé et une icône SVG selon le type", () => {
    expect(headsetBadgeHtml("filaire")).toContain(">Filaire</span>");
    expect(headsetBadgeHtml("sans_fil")).toContain(">Sans fil</span>");
    expect(headsetBadgeHtml("filaire")).toContain("<svg");
    expect(headsetBadgeHtml("filaire")).not.toBe(headsetBadgeHtml("sans_fil").replace("Sans fil", "Filaire"));
  });

  it("taille sm par défaut, md sur demande", () => {
    expect(headsetBadgeHtml("filaire")).toContain("px-2.5 py-1 text-[11px]");
    expect(headsetBadgeHtml("filaire", "md")).toContain("px-3 py-1.5 text-xs");
  });

  it("libellés exposés", () => {
    expect(HEADSET_LABELS).toEqual({ filaire: "Filaire", sans_fil: "Sans fil" });
  });
});
