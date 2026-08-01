// Exporta la sesión (cookies + localStorage) de Gemini desde TU Chrome ya
// logueado, para que el agente en la nube pueda generar imágenes sin tu
// máquina prendida (scripts/generate-cloud.mjs).
//
// ⚠️ El archivo resultante equivale a tu login completo de Google — trátalo
// como una contraseña. NUNCA lo commitees al repo (por eso .gitignore lo
// excluye). Este script solo lo guarda local; subirlo como GitHub Secret
// (GEMINI_SESSION_STATE) es un paso aparte que debes confirmar.
//
// Requisitos:
//   1. Chrome corriendo con debug port:  npm run chrome
//   2. Logueado en gemini.google.com en ese Chrome
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

  const b64 = Buffer.from(JSON.stringify(state)).toString("base64");
  const b64File = path.join(OUT_DIR, "gemini-storage-state.b64");
  await writeFile(b64File, b64);

  console.log(`\nSesión exportada: ${OUT_FILE}`);
  console.log(`Base64 listo para Secret: ${b64File} (${b64.length} chars)`);
  console.log(`\nSiguiente paso (con confirmación tuya): subirlo como GitHub Secret`);
  console.log(`  gh secret set GEMINI_SESSION_STATE -R <owner/repo> < ${b64File}`);
  console.log(`\n⚠️ No compartas ni commitees estos archivos — son tu sesión de Google.`);
  await browser.close().catch(() => {});
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
