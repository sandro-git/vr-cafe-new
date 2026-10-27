// Échappement HTML pour les gabarits injectés via innerHTML (admin, formulaires).
// Les guillemets sont échappés aussi : la valeur peut finir dans un attribut
// (href="mailto:…", title="…") et les emails/téléphones viennent de visiteurs.
export function esc(str: unknown, fallback = ""): string {
  return String(str ?? fallback)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
