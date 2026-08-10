// Puente automático open-carrusel → content/queue.
//
// open-carrusel (https://github.com/Hainrixz/open-carrusel) corre local en
// otra carpeta (hermana de este repo) y guarda sus carruseles en su propio
// data/carousels.json. Este script:
//   1. lee ese archivo,
//   2. toma los carruseles "listos" (tienen slides + caption, no son
//      plantilla, y no fueron importados antes),
//   3. le pide a la app (debe estar corriendo, `npm run dev` ahí) que
//      exporte los PNGs vía su API de export,
//   4. descomprime el zip en content/queue/<id>/assets/,
//   5. escribe caption.txt + meta.json (status pending) — mismo formato que
//      genera scripts/generate-content.mjs,
//   6. commitea y pushea (igual que hacen los demás scripts del bot).
//
// content/queue/<id>/ queda pendiente de aprobación en Telegram, igual que
// cualquier otro item — publish-queue.mjs no distingue de dónde vino.
//
// Env opcional:
//   OPEN_CARRUSEL_DIR  ruta a la carpeta de open-carrusel (default: ../open-carrusel)
//   OPEN_CARRUSEL_URL  base URL de la app corriendo (default: http://localhost:3000)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import AdmZip from "adm-zip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const QUEUE_DIR = path.join(ROOT, "content", "queue");
const STATE_FILE = path.join(ROOT, "content", "open-carrusel-imported.json");

const OC_DIR = process.env.OPEN_CARRUSEL_DIR || path.resolve(ROOT, "..", "open-carrusel");
const OC_URL = process.env.OPEN_CARRUSEL_URL || "http://localhost:3000";
const OC_CAROUSELS_JSON = path.join(OC_DIR, "data", "carousels.json");

function git(...args) {
  const r = spawnSync("git", args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} falló`);
}

function makeId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `carousel-${stamp}`;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function buildCaption(carousel) {
  const hashtags = (carousel.hashtags || []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  return [carousel.caption?.trim() || "", hashtags].filter(Boolean).join("\n\n");
}

async function main() {
  if (!existsSync(OC_CAROUSELS_JSON)) {
    console.log(`No encuentro ${OC_CAROUSELS_JSON} — ¿está clonado open-carrusel ahí? (OPEN_CARRUSEL_DIR para override)`);
    return;
  }

  const ocData = await readJson(OC_CAROUSELS_JSON, { carousels: [] });
  const state = await readJson(STATE_FILE, { importedIds: [] });
  const importedSet = new Set(state.importedIds);

  const candidates = (ocData.carousels || []).filter(
    (c) => !c.isTemplate && c.slides?.length > 0 && c.caption?.trim() && !importedSet.has(c.id)
  );

  if (candidates.length === 0) {
    console.log("Sin carruseles nuevos y listos (con caption) en open-carrusel.");
    return;
  }

  // Chequeo rápido de que el server esté vivo antes de gastar tiempo.
  try {
    await fetch(OC_URL, { method: "GET" });
  } catch {
    console.log(`open-carrusel no responde en ${OC_URL} — abrí "npm run dev" ahí y reintentá.`);
    return;
  }

  let changed = false;

  for (const carousel of candidates) {
    console.log(`\n▶ Importando "${carousel.name}" (${carousel.id}, ${carousel.slides.length} slides)`);

    const res = await fetch(`${OC_URL}/api/carousels/${carousel.id}/export`, { method: "POST" });
    if (!res.ok) {
      console.error(`  ✗ Export falló (${res.status}): ${await res.text().catch(() => "")}`);
      continue; // no lo marcamos como importado — se reintenta la próxima corrida
    }
    const zipBuffer = Buffer.from(await res.arrayBuffer());

    const id = makeId();
    const itemDir = path.join(QUEUE_DIR, id);
    const assetsDir = path.join(itemDir, "assets");
    await mkdir(assetsDir, { recursive: true });

    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(assetsDir, true);

    const caption = buildCaption(carousel);
    await writeFile(path.join(itemDir, "caption.txt"), caption + "\n");

    const meta = {
      id,
      type: "carousel",
      targets: ["fb", "ig"],
      source: { tool: "open-carrusel", carouselId: carousel.id, carouselName: carousel.name },
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    await writeFile(path.join(itemDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");

    console.log(`  ✅ content/queue/${id} listo (pendiente de aprobación en Telegram)`);

    importedSet.add(carousel.id);
    changed = true;
  }

  if (changed) {
    state.importedIds = [...importedSet];
    await writeFile(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
    git("add", "content/queue", "content/open-carrusel-imported.json");
    git(
      "-c", "user.name=iteknology-bot",
      "-c", "user.email=bot@iteknology.local",
      "commit", "-m", "chore: importar carrusel(es) desde open-carrusel a la queue [skip ci]"
    );
    git("push");
  }

  console.log("\nListo.");
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
