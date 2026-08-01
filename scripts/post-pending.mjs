// Publica una lista fija de imágenes pendientes, 1 cada 10 min, en FB + IG.
// Uso puntual (background). No toca state.index (no interfiere con la rotación diaria).
//
// Requiere env: META_PAGE_ID, META_IG_USER_ID, META_ACCESS_TOKEN, RAW_BASE

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPageToken, postFacebookPhoto, postInstagramImage } from "./lib/graph.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const COPY_FILE = path.join(ROOT, "content", "copy.json");
const LOG_FILE = path.join(ROOT, "content", "pending-post-log.json");

const GAP_MS = 10 * 60 * 1000; // 10 minutos
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Imagen → índice de caption en copy.json (temático, sin repetir 06)
const ITEMS = [
  { img: "02.jpg", ci: 4 },  // Vende 24/7 → "Deja de perder ventas cuando duermes"
  { img: "03.jpg", ci: 11 }, // De WhatsApp → "Antes: te paso el catálogo…"
  { img: "04.jpg", ci: 3 },  // Restaurante/tienda/delivery → "todo cabe"
  { img: "05.jpg", ci: 7 },  // Empieza gratis → "El mejor momento es HOY"
  { img: "07.jpg", ci: 1 },  // Sin código → "Tu negocio merece más…"
];

async function main() {
  const pageId = process.env.META_PAGE_ID;
  const igUserId = process.env.META_IG_USER_ID;
  const token = process.env.META_ACCESS_TOKEN;
  const rawBase = process.env.RAW_BASE;
  if (!pageId || !igUserId || !token || !rawBase) throw new Error("Faltan variables de entorno");

  const copy = JSON.parse(await readFile(COPY_FILE, "utf8"));
  const pageToken = await getPageToken(pageId, token);
  const log = [];

  for (let i = 0; i < ITEMS.length; i++) {
    const { img, ci } = ITEMS[i];
    const caption = copy[ci];
    const imageUrl = `${rawBase}/${img}`;
    console.log(`\n[${i + 1}/${ITEMS.length}] ${img} @ ${new Date().toISOString()}`);
    try {
      const fb = await postFacebookPhoto(pageId, pageToken, imageUrl, caption);
      console.log(`  FB ok: ${fb}`);
      const ig = await postInstagramImage(igUserId, pageToken, imageUrl, caption);
      console.log(`  IG ok: ${ig}`);
      log.push({ img, at: new Date().toISOString(), fb, ig });
    } catch (e) {
      console.error(`  ✗ ${img}: ${e.message}`);
      log.push({ img, at: new Date().toISOString(), error: e.message });
    }
    await writeFile(LOG_FILE, JSON.stringify(log, null, 2) + "\n");
    if (i < ITEMS.length - 1) {
      console.log(`  esperando 10 min…`);
      await sleep(GAP_MS);
    }
  }
  console.log("\n=== TODO PUBLICADO ===");
  console.log(JSON.stringify(log, null, 2));
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
