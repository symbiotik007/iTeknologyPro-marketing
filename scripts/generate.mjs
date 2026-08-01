// Generador de imágenes de posts vía Gemini web (borrador).
//
// Estrategia: NO automatiza login. Se conecta por CDP a TU Chrome ya abierto
// (con tu sesión de Google intacta), abre una pestaña nueva, manda un prompt del
// vault a Gemini, espera la imagen generada, la descarga, la convierte a JPEG
// 1080x1080 y la deja en content/images/. Marca el prompt como usado en el vault.
//
// Requisitos:
//   1. Chrome corriendo con debug port:  npm run chrome   (cierra Chrome antes)
//   2. Estar logueado en gemini.google.com en ese Chrome
//   3. ffmpeg en PATH (ya lo usas para el poster)
//
// Uso:   npm run generate            (genera 2 por defecto — modo prueba)
//        node scripts/generate.mjs 5 (genera 5)
//
// Corre LOCAL en tu máquina (no en GitHub Actions): usa tu sesión y tu IP.

import { chromium } from "playwright";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseVault, toJpeg1080, askGeminiForImage } from "./lib/gemini.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IMAGES_DIR = path.join(ROOT, "content", "images");
const RAW_DIR = path.join(ROOT, "content", "_raw");
const VAULT = path.join(ROOT, "content", "prompts-vault.md");

const CDP_URL = process.env.CDP_URL || "http://127.0.0.1:9222";
const COUNT = Number(process.argv[2] || 2);

async function nextIndex() {
  const files = (await readdir(IMAGES_DIR)).filter((f) => /^\d+\.(jpe?g|png)$/i.test(f));
  const max = files.reduce((m, f) => Math.max(m, parseInt(f, 10) || 0), 0);
  return max + 1;
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });

  const md = await readFile(VAULT, "utf8");
  const { lines, blocks } = parseVault(md);
  const pending = blocks.filter((b) => !b.used).slice(0, COUNT);
  if (pending.length === 0) {
    console.log("No hay prompts sin usar en el vault. Agrega más o quita tags -USED.");
    return;
  }
  console.log(`Prompts a generar: ${pending.length}`);

  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch (e) {
    console.error(`\nNo pude conectar a Chrome en ${CDP_URL}.`);
    console.error("Arranca Chrome con debug port primero:  npm run chrome\n");
    process.exit(1);
  }
  const context = browser.contexts()[0];
  if (!context) throw new Error("Chrome sin contexto. ¿Está abierto tu perfil?");

  let idx = await nextIndex();
  const usedTitleLines = [];

  for (const block of pending) {
    console.log(`\n▶ [${String(idx).padStart(2, "0")}] ${block.title}`);
    const page = await context.newPage();
    try {
      const raw = path.join(RAW_DIR, `${String(idx).padStart(2, "0")}.png`);
      const saved = await askGeminiForImage(page, block.prompt, raw);
      if (!saved) throw new Error("No apareció imagen dentro del tiempo límite.");

      const out = path.join(IMAGES_DIR, `${String(idx).padStart(2, "0")}.jpg`);
      toJpeg1080(raw, out);
      console.log(`  ✓ guardada: content/images/${path.basename(out)}`);

      usedTitleLines.push({ line: block.titleLine, img: path.basename(out) });
      idx++;
    } catch (e) {
      console.error(`  ✗ error: ${e.message}`);
    } finally {
      await page.close().catch(() => {});
    }
  }

  // Marcar en el vault los prompts usados
  if (usedTitleLines.length) {
    for (const { line, img } of usedTitleLines) {
      lines[line] = lines[line].replace(/\s*$/, ` -USED → ${img}`);
    }
    await writeFile(VAULT, lines.join("\n"));
    console.log(`\nVault actualizado: ${usedTitleLines.length} prompt(s) marcados -USED.`);
  }

  // NO cerramos el browser: dejar Chrome vivo para próximas corridas.
  console.log("\nListo. Revisa content/images/ y haz push cuando quieras.");
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
