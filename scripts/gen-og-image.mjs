// Génère public/og-image.jpg (1200×630) à partir de la photo du café.
// Recadrage "cover" avec position "attention" pour conserver la zone saillante
// (enseigne lumineuse VR Café). Lancer : node scripts/gen-og-image.mjs
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../src/assets/vrcafe.webp", import.meta.url));
const out = fileURLToPath(new URL("../public/og-image.jpg", import.meta.url));

await sharp(src)
  .resize(1200, 630, { fit: "cover", position: "attention" })
  .jpeg({ quality: 82 })
  .toFile(out);

console.log("✅ public/og-image.jpg généré (1200×630)");
