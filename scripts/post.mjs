// Publica un post (imagen + copy) en la página de Facebook y en Instagram Business
// de iTeknology usando la Graph API de Meta. Corre en GitHub Actions (cron) o local.
//
// Rotación: recorre content/images/ ordenado y content/copy.json en paralelo,
// avanzando un índice guardado en content/state.json. Cada corrida publica UNO.
//
// Variables de entorno requeridas (GitHub Secrets en producción):
//   META_PAGE_ID        id numérico de la página de Facebook
//   META_IG_USER_ID     id de la cuenta de Instagram Business
//   META_ACCESS_TOKEN   Page Access Token de larga duración (con permisos IG)
//   GITHUB_REPOSITORY   (lo pone Actions solo) owner/repo -> para armar raw URL
//   GITHUB_REF_NAME     (lo pone Actions solo) rama, ej. main
// Opcionales:
//   RAW_BASE            base pública de imágenes (si no usas GitHub raw)
//   DRY_RUN=1           no publica, solo imprime lo que haría
//   TARGETS             "fb,ig" (default) — desactiva una red si quieres

import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPageToken, postFacebookPhoto, postInstagramImage } from "./lib/graph.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IMAGES_DIR = path.join(ROOT, "content", "images");
const COPY_FILE = path.join(ROOT, "content", "copy.json");
const STATE_FILE = path.join(ROOT, "content", "state.json");

const DRY = process.env.DRY_RUN === "1";
const TARGETS = (process.env.TARGETS || "fb,ig").split(",").map((s) => s.trim());

function need(name) {
  const v = process.env[name];
  if (!v && !DRY) throw new Error(`Falta la variable de entorno ${name}`);
  return v || `<${name}>`;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

// Construye la URL pública raw de GitHub para una imagen del repo.
function rawUrl(filename) {
  if (process.env.RAW_BASE) return `${process.env.RAW_BASE}/${filename}`;
  const repo = process.env.GITHUB_REPOSITORY; // owner/repo
  const ref = process.env.GITHUB_REF_NAME || "main";
  if (!repo) throw new Error("Sin GITHUB_REPOSITORY ni RAW_BASE: no puedo armar la URL pública de la imagen");
  return `https://raw.githubusercontent.com/${repo}/${ref}/content/images/${encodeURIComponent(filename)}`;
}

async function main() {
  const pageId = need("META_PAGE_ID");
  const igUserId = need("META_IG_USER_ID");
  const token = need("META_ACCESS_TOKEN");

  const images = (await readdir(IMAGES_DIR))
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .sort();
  if (images.length === 0) throw new Error("No hay imágenes en content/images/");

  const copy = await readJson(COPY_FILE, []);
  if (!Array.isArray(copy) || copy.length === 0) throw new Error("content/copy.json vacío");

  const state = await readJson(STATE_FILE, { index: 0, log: [] });
  const idx = state.index || 0;

  const image = images[idx % images.length];
  const caption = copy[idx % copy.length];
  const imageUrl = rawUrl(image);

  console.log(`Post #${idx}`);
  console.log(`  imagen : ${image}`);
  console.log(`  url    : ${imageUrl}`);
  console.log(`  caption: ${caption.slice(0, 80)}...`);

  const results = {};
  if (DRY) {
    console.log("DRY_RUN: no se publica nada.");
  } else {
    // Page token para FB (obligatorio) y también sirve para publicar en IG.
    const pageToken = await getPageToken(pageId, token);
    if (TARGETS.includes("fb")) {
      results.fb = await postFacebookPhoto(pageId, pageToken, imageUrl, caption);
      console.log(`  FB ok: ${results.fb}`);
    }
    if (TARGETS.includes("ig")) {
      results.ig = await postInstagramImage(igUserId, pageToken, imageUrl, caption);
      console.log(`  IG ok: ${results.ig}`);
    }
  }

  state.index = idx + 1;
  state.log = (state.log || []).slice(-49);
  state.log.push({ at: new Date().toISOString(), index: idx, image, results });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
  console.log("state.json actualizado.");
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
