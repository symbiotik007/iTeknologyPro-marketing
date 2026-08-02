// Exporta la sesión (cookies + localStorage) de Gemini desde TU Chrome ya
// logueado (perfil dedicado, ver npm run chrome), para uso local en
// scripts/generate-local.mjs / lib/gemini.mjs (headless, sin CDP).
//
// ⚠️ El archivo resultante equivale a tu login completo de Google — trátalo
// como una contraseña. NUNCA lo commitees al repo (ya está en .gitignore).
//
// Requisitos:
//   1. Chrome corriendo con debug port:  npm run chrome
//   2. Logueado en gemini.google.com en ese Chrome (perfil dedicado)
//
// Uso:  node scripts/export-gemini-session.mjs

import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, ".gen-tmp");
const OUT_FILE = path.join(OUT_DIR, "gemini-storage-state.json");

const CDP_URL = process.env.CDP_URL || "http://127.0.0.1:9222";

async function main() {
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

  await mkdir(OUT_DIR, { recursive: true });
  const state = await context.storageState();
  await writeFile(OUT_FILE, JSON.stringify(state, null, 2));

  console.log(`\nSesión exportada: ${OUT_FILE}`);
  console.log(`\n⚠️ No compartas ni commitees este archivo — es tu sesión de Google.`);
  await browser.close().catch(() => {});
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
