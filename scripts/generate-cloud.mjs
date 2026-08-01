// Genera imágenes con Gemini SIN Chrome local: lanza un Chromium headless
// propio y le inyecta la sesión ya logueada (exportada antes con
// scripts/export-gemini-session.mjs y guardada como Secret GEMINI_SESSION_STATE).
// Pensado para correr desde el agente Claude programado (sandbox en la nube).
//
// ⚠️ Riesgo conocido: Google puede detectar la IP de datacenter de la nube como
// "actividad inusual" y bloquear/pedir reverificación aunque las cookies sean
// válidas — esto es más frágil que una API key. Si esto falla repetidamente,
// el agente que llama este script debe usar como fallback la herramienta MCP
// HighsField `generate_image` (con use_unlim si hay cupo gratis) en vez de
// reintentar esto indefinidamente. Este script NO implementa ese fallback
// (no puede llamar MCP tools desde un subproceso node) — es responsabilidad
// del agente que lo invoca.
//
// Uso:
//   GEMINI_SESSION_STATE=<base64> node scripts/generate-cloud.mjs prompts.json content/queue/tmp-assets/
//
// prompts.json: ["prompt 1", "prompt 2", ...]  (1 imagen por prompt, en orden)
// Salida: <outDir>/01.jpg, 02.jpg, ... (1080x1080 JPEG)

import { chromium } from "playwright";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { askGeminiForImage, saveDataUrl, toJpeg1080 } from "./lib/gemini.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP_DIR = path.join(ROOT, ".gen-tmp");

async function main() {
  const promptsPath = process.argv[2];
  const outDir = process.argv[3];
  if (!promptsPath || !outDir) {
    throw new Error("Uso: node scripts/generate-cloud.mjs prompts.json outDir/");
  }

  const b64 = process.env.GEMINI_SESSION_STATE;
  if (!b64) throw new Error("Falta GEMINI_SESSION_STATE (sesión exportada, en base64)");

  const prompts = JSON.parse(await readFile(promptsPath, "utf8"));
  if (!Array.isArray(prompts) || prompts.length === 0) {
    throw new Error("prompts.json debe ser un array no vacío de strings");
  }

  await mkdir(TMP_DIR, { recursive: true });
  await mkdir(outDir, { recursive: true });
  const statePath = path.join(TMP_DIR, `session-${Date.now()}.json`);
  await writeFile(statePath, Buffer.from(b64, "base64"));

  console.log(`Generando ${prompts.length} imagen(es) vía Gemini headless…`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: statePath });

  try {
    for (let i = 0; i < prompts.length; i++) {
      const n = String(i + 1).padStart(2, "0");
      console.log(`\n▶ [${n}] ${prompts[i].slice(0, 60)}...`);
      const page = await context.newPage();
      try {
        const dataUrl = await askGeminiForImage(page, prompts[i]);
        if (!dataUrl) throw new Error("No apareció imagen dentro del tiempo límite.");
        const raw = path.join(TMP_DIR, `raw-${n}.png`);
        await saveDataUrl(dataUrl, raw);
        const out = path.join(outDir, `${n}.jpg`);
        toJpeg1080(raw, out);
        console.log(`  ✓ guardada: ${out}`);
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    await rm(statePath, { force: true });
  }

  console.log("\nListo.");
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  // Exit code 2 = sesión caducada/bloqueada: el que llama este script debe
  // avisar por Telegram y usar el fallback (HighsField), no reintentar la
  // misma sesión muerta.
  process.exit(err.code === "SESSION_EXPIRED" ? 2 : 1);
});
