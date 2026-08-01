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
// Escucha las respuestas de red de la página y guarda en outPath la primera
// imagen "grande" (> 30KB, no ícono/avatar) que llegue — son los bytes
// EXACTOS del archivo generado, sin pasar por canvas/fetch de JS ni por
// screenshot del DOM (evita CORS, "tainted canvas", y capturar de más la UI
// de Gemini alrededor de la imagen).
export function watchForGeneratedImage(page, outPath) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; page.off("response", onResponse); resolve(null); }
    }, IMG_TIMEOUT_MS);

    async function onResponse(response) {
      if (done) return;
      const url = response.url();
      if (/gstatic|favicon|avatar|profile|sparkle/i.test(url)) return;
      const headers = response.headers();
      const contentType = headers["content-type"] || "";
      if (!contentType.startsWith("image/")) return;
      try {
        const body = await response.body();
        if (body.length < 30_000) return; // ícono/thumbnail chico, no es la imagen generada
        done = true;
        clearTimeout(timer);
        page.off("response", onResponse);
        const { writeFile } = await import("node:fs/promises");
        await writeFile(outPath, body);
        resolve(outPath);
      } catch {
        // respuesta ya consumida/inaccesible, seguir esperando otra
      }
    }

    page.on("response", onResponse);
  });
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

// Manda un prompt a una pestaña de Gemini ya abierta y guarda la imagen
// generada en outPath (PNG). Devuelve outPath, o null si no apareció a tiempo.
export async function askGeminiForImage(page, prompt, outPath) {
  await page.goto(GEMINI_URL, { waitUntil: "domcontentloaded" });
  await sleep(3000);

  if (!(await isLoggedIn(page))) {
    // Diagnóstico: guardar screenshot + texto visible para saber si de verdad
    // pide login o si es un falso positivo (banner de consentimiento, etc).
    try {
      await page.screenshot({ path: "/tmp/gemini-debug.png" }).catch(() => {});
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
      console.log("DEBUG body text:", bodyText);
      console.log("DEBUG url:", page.url());
    } catch {}
    const err = new Error("SESIÓN_CADUCADA: Gemini pide iniciar sesión de nuevo");
    err.code = "SESSION_EXPIRED";
    throw err;
  }

  const input = await firstVisible(page, INPUT_SELECTORS);
  if (!input) throw new Error("No encontré el campo de texto de Gemini (revisar selectores).");

  // Adjuntar el listener de red ANTES de enviar, para no perder la respuesta.
  const imagePromise = watchForGeneratedImage(page, outPath);

  await input.click();
  await input.fill(prompt).catch(async () => { await page.keyboard.insertText(prompt); });
  await sleep(500);

  const send = await firstVisible(page, SEND_SELECTORS);
  if (send) await send.click(); else await page.keyboard.press("Enter");

  return imagePromise;
}
