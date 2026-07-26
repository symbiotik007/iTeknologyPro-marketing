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
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IMAGES_DIR = path.join(ROOT, "content", "images");
const RAW_DIR = path.join(ROOT, "content", "_raw");
const VAULT = path.join(ROOT, "content", "prompts-vault.md");

const CDP_URL = process.env.CDP_URL || "http://127.0.0.1:9222";
const GEMINI_URL = "https://gemini.google.com/app";
const COUNT = Number(process.argv[2] || 2);
const IMG_TIMEOUT_MS = 180_000; // Gemini puede tardar en generar

// Selectores candidatos (Gemini cambia el DOM; probamos varios en orden) ─────────
const INPUT_SELECTORS = [
  'rich-textarea div[contenteditable="true"]',
  'div.ql-editor[contenteditable="true"]',
  'div[contenteditable="true"][role="textbox"]',
  'textarea',
];
const SEND_SELECTORS = [
  'button[aria-label*="Enviar" i]',
  'button[aria-label*="Send" i]',
  'button.send-button',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Vault: parsear bloques (### Título \n ```prompt```) ─────────────────────────
function parseVault(md) {
  const lines = md.split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^###\s+(.*)$/);
    if (!m) continue;
    const title = m[1].trim();
    // buscar el primer bloque ``` … ``` bajo este título
    let j = i + 1, open = -1, close = -1;
    for (; j < lines.length && !lines[j].startsWith("### "); j++) {
      if (lines[j].trim().startsWith("```")) {
        if (open === -1) open = j; else { close = j; break; }
      }
    }
    if (open !== -1 && close !== -1) {
      const prompt = lines.slice(open + 1, close).join("\n").trim();
      blocks.push({ titleLine: i, title, prompt, used: /-USED/.test(title) });
    }
  }
  return { lines, blocks };
}

async function nextIndex() {
  const files = (await readdir(IMAGES_DIR)).filter((f) => /^\d+\.(jpe?g|png)$/i.test(f));
  const max = files.reduce((m, f) => Math.max(m, parseInt(f, 10) || 0), 0);
  return max + 1;
}

async function saveDataUrl(dataUrl, destRaw) {
  const b64 = dataUrl.split(",")[1];
  await writeFile(destRaw, Buffer.from(b64, "base64"));
}

function toJpeg1080(rawPath, outPath) {
  const r = spawnSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", rawPath,
    "-vf", "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,format=yuv420p",
    "-q:v", "3", outPath,
  ], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg falló al convertir " + rawPath);
}

async function firstVisible(page, selectors) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    try { if (await loc.count() && await loc.isVisible()) return loc; } catch {}
  }
  return null;
}

// Espera la imagen generada y la extrae vía canvas (sin fetch: los blob de Gemini
// no se dejan re-fetchear, pero el <img> ya cargado sí se lee por canvas) ─────────
async function grabImageDataUrl(page) {
  const start = Date.now();
  while (Date.now() - start < IMG_TIMEOUT_MS) {
    const data = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("img"))
        .filter((im) => im.naturalWidth >= 512 && im.naturalHeight >= 512)
        .filter((im) => !/gstatic|sparkle|avatar|profile|logo/i.test(im.src + " " + (im.alt || "")));
      imgs.sort((a, b) =>
        (/generat/i.test(b.alt) ? 1 : 0) - (/generat/i.test(a.alt) ? 1 : 0) ||
        b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight
      );
      const img = imgs[0];
      if (!img) return null;
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        return c.toDataURL("image/png");
      } catch (e) { return "ERR:" + e.message; }
    });
    if (data && data.startsWith("data:")) return data;
    if (data && data.startsWith("ERR:")) console.log("  canvas:", data.slice(0, 80));
    await sleep(2500);
  }
  return null;
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
      await page.goto(GEMINI_URL, { waitUntil: "domcontentloaded" });
      await sleep(3000);

      const input = await firstVisible(page, INPUT_SELECTORS);
      if (!input) throw new Error("No encontré el campo de texto de Gemini (revisar selectores).");
      await input.click();
      await input.fill(block.prompt).catch(async () => { await page.keyboard.insertText(block.prompt); });
      await sleep(500);

      const send = await firstVisible(page, SEND_SELECTORS);
      if (send) await send.click(); else await page.keyboard.press("Enter");
      console.log("  prompt enviado, esperando imagen…");

      const dataUrl = await grabImageDataUrl(page);
      if (!dataUrl) throw new Error("No apareció imagen dentro del tiempo límite.");

      const raw = path.join(RAW_DIR, `${String(idx).padStart(2, "0")}.png`);
      await saveDataUrl(dataUrl, raw);
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
