// Génère netlify/lib/staff-guide-content.generated.ts à partir de content/staff-guide.md,
// pour que la fonction admin-chat.mts importe la doc comme un simple module TS
// (bundlé par esbuild avec la function) plutôt que de la lire sur disque à chaque requête.
// Exécuté avant `astro build` et avant `astro dev` (voir package.json).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(rootDir, "content", "staff-guide.md");
const outDir = join(rootDir, "netlify", "lib");
const outPath = join(outDir, "staff-guide-content.generated.ts");

const content = readFileSync(sourcePath, "utf-8");

mkdirSync(outDir, { recursive: true });
writeFileSync(
  outPath,
  `// Fichier généré automatiquement depuis content/staff-guide.md — ne pas éditer à la main.
// Régénéré par scripts/build-staff-guide.mjs (voir package.json : "build" / "dev:netlify").
export const STAFF_GUIDE = ${JSON.stringify(content)};
`,
);

console.log(`staff-guide-content.generated.ts régénéré (${content.length} caractères)`);
