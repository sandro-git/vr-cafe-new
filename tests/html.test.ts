import { describe, expect, it } from "vitest";
import { esc } from "../src/lib/html";

describe("esc", () => {
  it("échappe les caractères HTML, guillemets compris", () => {
    expect(esc(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });

  it("empêche de sortir d'un attribut entre guillemets", () => {
    expect(`<a href="mailto:${esc('a"onmouseover=alert(1)@b.fr')}">`).not.toContain('"onmouseover');
  });

  it("utilise le repli pour null/undefined", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined, "—")).toBe("—");
    expect(esc(0)).toBe("0");
  });
});
