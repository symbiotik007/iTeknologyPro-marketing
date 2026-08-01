// Lógica compartida de scraping de Gemini web, usada por:
//   - scripts/generate.mjs        (CDP contra Chrome local del usuario)
//   - scripts/generate-cloud.mjs  (headless, con sesión exportada)

import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

export const GEMINI_URL = "https://gemini.google.com/app";
export const IMG_TIMEOUT_MS = 180_000; // Gemini puede tardar en generar

export const INPUT_SELECTORS = [
  'rich-textarea div[contenteditable="true"]',
  'div.ql-editor[contenteditable="true"]',
  'div[contenteditable="true"][role="textbox"]',
  'textarea',
];
export const SEND_SELECTORS = [
  'button[aria-label*="Enviar" i]',
  'button[aria-label*="Send" i]',
  'button.send-button',
];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Vault: parsear bloques (### Título \n ```prompt```) ─────────────────────────
export function parseVault(md) {
  const lines = md.split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^###\s+(.*)$/);
    if (!m) continue;
    const title = m[1].trim();
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

export async function saveDataUrl(dataUrl, destRaw) {
  const b64 = dataUrl.split(",")[1];
  await writeFile(destRaw, Buffer.from(b64, "base64"));
}

export function toJpeg1080(rawPath, outPath) {
  const r = spawnSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", rawPath,
    "-vf", "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,format=yuv420p",
    "-q:v", "3", outPath,
  ], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg falló al convertir " + rawPath);
}

export async function firstVisible(page, selectors) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    try { if (await loc.count() && await loc.isVisible()) return loc; } catch {}
  }
  return null;
}

// Espera la imagen generada y la extrae vía canvas (sin fetch: los blob de Gemini
// no se dejan re-fetchear, pero el <img> ya cargado sí se lee por canvas).
export async function grabImageDataUrl(page) {
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

// Detecta si la sesión sigue logueada (vs. pantalla de "Iniciar sesión"). Se usa
// para distinguir "sesión caducada" (hay que re-exportarla) de otros errores.
export async function isLoggedIn(page) {
  // OJO: no matchear cualquier link a accounts.google.com — el menú de cuenta
  // ya logueado también apunta ahí (SignOutOptions). Solo cuenta como "no
  // logueado" un link/botón real de INICIAR sesión.
  const loginButton = page.locator(
    'a[href*="accounts.google.com/ServiceLogin"], a[href*="accounts.google.com/signin"], ' +
    'button:has-text("Sign in"), button:has-text("Iniciar sesión")'
  );
  try {
    return (await loginButton.count()) === 0;
  } catch {
    return true; // si no se puede evaluar, no asumimos que la sesión murió
  }
}

// Manda un prompt a una pestaña de Gemini ya abierta y devuelve el dataURL de
// la imagen generada (o null si no apareció a tiempo).
export async function askGeminiForImage(page, prompt) {
  await page.goto(GEMINI_URL, { waitUntil: "domcontentloaded" });
  await sleep(3000);

  if (!(await isLoggedIn(page))) {
    const err = new Error("SESIÓN_CADUCADA: Gemini pide iniciar sesión de nuevo");
    err.code = "SESSION_EXPIRED";
    throw err;
  }

  const input = await firstVisible(page, INPUT_SELECTORS);
  if (!input) throw new Error("No encontré el campo de texto de Gemini (revisar selectores).");
  await input.click();
  await input.fill(prompt).catch(async () => { await page.keyboard.insertText(prompt); });
  await sleep(500);

  const send = await firstVisible(page, SEND_SELECTORS);
  if (send) await send.click(); else await page.keyboard.press("Enter");

  return grabImageDataUrl(page);
}
