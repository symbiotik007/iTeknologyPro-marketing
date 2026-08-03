// Ciclo completo de generación, 100% determinístico — sin IA generando el
// diseño (ese problema ya se resolvió: template real en scripts/template/,
// renderizado con Playwright vía scripts/lib/render-template.mjs). Rota
// contenido de content/content-bank.json (single/carousel), arma el draft,
// y llama generate-content.mjs (arma la queue, comitea+pushea, notifica
// Telegram).
//
// Pensado para correr 2x/día vía Task Scheduler de Windows en esta máquina
// (no necesita Chrome, no necesita sesión de Gemini).
//
// Requiere: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID / GITHUB_REPOSITORY en el
// entorno (ver scripts/run-generate-local.bat).
//
// Uso:  node scripts/generate-local.mjs [single|carousel]
//       (si no se pasa tipo, rota solo entre single/carousel usando
//        content/generator-state.json)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { askGeminiForImage } from "./lib/gemini.mjs";
import { sendMessage } from "./lib/telegram.mjs";
import {
  renderFeatureHighlight,
  renderHook,
  renderProblem,
  renderConsequence,
  renderSolution,
  renderCtaFinal,
} from "./lib/render-template.mjs";
import { push as gitPush, commit as gitCommit } from "./lib/git.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SINGLE_BANK_FILE = path.join(ROOT, "content", "single-posts", "content-bank.json");
const CAROUSEL_BANK_FILE = path.join(ROOT, "content", "carousels", "content-bank.json");
const STATE_FILE = path.join(ROOT, "content", "generator-state.json");
const TMP_OUT = path.join(ROOT, ".gen-tmp", "local-run");
const SESSION_FILE = path.join(ROOT, ".gen-tmp", "gemini-storage-state.json");
const SITE_URL = "https://iteknology.co/onboarding";

// Genera la ilustración vía Gemini (sesión local exportada). Si falla por
// cualquier razón (sesión caducada, timeout, sin imagen a tiempo, etc.)
// devuelve null — el llamador cae al ícono SVG fijo, nunca bloquea la
// corrida por esto. OJO: askGeminiForImage puede devolver null en vez de
// lanzar error (timeout esperando la imagen) -- eso pasaba silencioso antes
// (bug real: post salió con ícono generico sin ningún aviso). Ahora se trata
// igual que un error: se loggea y se reintenta una vez con browser fresco.
async function tryGenerateIllustrationOnce(prompt, outPath) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: SESSION_FILE, acceptDownloads: true });
    const page = await context.newPage();
    return await askGeminiForImage(page, prompt, outPath);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function tryGenerateIllustration(prompt, outPath) {
  try {
    await readFile(SESSION_FILE);
  } catch {
    console.log("  (sin sesión de Gemini exportada — uso ícono fijo)");
    await sendMessage("⚠️ No hay sesión de Gemini exportada — el post de hoy usó ícono genérico en vez de ilustración real. Corre `npm run chrome` + `node scripts/export-gemini-session.mjs` para arreglarlo.").catch(() => {});
    return null;
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await tryGenerateIllustrationOnce(prompt, outPath);
      if (result) return result;
      console.log(`  (intento ${attempt}: Gemini no devolvió imagen a tiempo)`);
    } catch (err) {
      console.log(`  (intento ${attempt}: ilustración Gemini falló: ${err.message})`);
    }
  }

  console.log("  (2 intentos fallidos — uso ícono fijo, avisando por Telegram)");
  await sendMessage(
    "⚠️ La ilustración de Gemini falló 2 veces seguidas (probablemente sesión caducada) — el post de hoy salió con ícono genérico en vez de imagen real. Corre `npm run chrome` + `node scripts/export-gemini-session.mjs` para renovar la sesión."
  ).catch(() => {});
  return null;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function git(...args) {
  const r = spawnSync("git", args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} falló`);
}

async function main() {
  const forcedType = process.argv[2];

  const singleBank = await readJson(SINGLE_BANK_FILE, []);
  const carouselBank = await readJson(CAROUSEL_BANK_FILE, []);
  const state = await readJson(STATE_FILE, {
    cycleIndex: 0,
    singleIndex: 0,
    carouselIndex: 0,
  });

  // Ciclo diario: 2 carruseles + 1 single (en ese orden). 3 disparos al día
  // (Task Scheduler) avanzan este ciclo uno por uno.
  const CYCLE = ["carousel", "single", "carousel"];
  const type = forcedType || CYCLE[(state.cycleIndex || 0) % CYCLE.length];

  if (type === "single" && singleBank.length === 0) throw new Error("content/single-posts/content-bank.json vacío");
  if (type === "carousel" && carouselBank.length === 0) throw new Error("content/carousels/content-bank.json vacío");

  await mkdir(TMP_OUT, { recursive: true });

  let caption, assets;

  if (type === "single") {
    const entry = singleBank[(state.singleIndex || 0) % singleBank.length];
    const out = path.join(TMP_OUT, "01.jpg");

    let illustrationPath = null;
    if (entry.illustrationPrompt) {
      const rawIllustration = path.join(TMP_OUT, "illustration.png");
      illustrationPath = await tryGenerateIllustration(entry.illustrationPrompt, rawIllustration);
    }

    await renderFeatureHighlight({ ...entry, illustrationPath }, out);
    assets = [out];
    caption = `${entry.headline.text}\n\n${entry.subtitle}\n\n${entry.cta} 👉 ${SITE_URL}\n\n#iTeknology #TiendaOnline #SinCodigo`;
    state.singleIndex = (state.singleIndex || 0) + 1;
  } else {
    // Formato B2 aprobado: Hook (imagen) -> Problema (imagen) -> Consecuencia
    // (texto, sin imagen) -> Solución (imagen) -> Resultado+CTA (imagen).
    const entry = carouselBank[(state.carouselIndex || 0) % carouselBank.length];
    const paths = [
      path.join(TMP_OUT, "01.jpg"),
      path.join(TMP_OUT, "02.jpg"),
      path.join(TMP_OUT, "03.jpg"),
      path.join(TMP_OUT, "04.jpg"),
      path.join(TMP_OUT, "05.jpg"),
    ];

    async function illustrationFor(prompt, name) {
      if (!prompt) return null;
      return tryGenerateIllustration(prompt, path.join(TMP_OUT, `illustration-${name}.png`));
    }

    const hookIllustration = await illustrationFor(entry.hook.illustrationPrompt, "hook");
    await renderHook({ ...entry.hook, illustrationPath: hookIllustration }, paths[0]);

    const problemIllustration = await illustrationFor(entry.problem.illustrationPrompt, "problem");
    await renderProblem({ ...entry.problem, illustrationPath: problemIllustration }, paths[1]);

    await renderConsequence(entry.consequence, paths[2]);

    const solutionIllustration = await illustrationFor(entry.solution.illustrationPrompt, "solution");
    await renderSolution({ ...entry.solution, illustrationPath: solutionIllustration }, paths[3]);

    const resultCtaIllustration = await illustrationFor(entry.resultCta.illustrationPrompt, "resultcta");
    await renderCtaFinal({ ...entry.resultCta, illustrationPath: resultCtaIllustration }, paths[4]);

    assets = paths;
    caption = `${entry.captionHook}\n\n` +
      `En iTeknology ayudamos a recuperar el control de tu negocio: app propia, logística inteligente y gestión de pedidos unificada.\n\n` +
      `${entry.resultCta.ctaButton} 👉 ${SITE_URL}\n\n` +
      `${entry.hashtags}`;
    state.carouselIndex = (state.carouselIndex || 0) + 1;
  }

  const draft = { type, targets: ["fb", "ig"], caption, assets };
  const draftFile = path.join(TMP_OUT, "draft.json");
  await writeFile(draftFile, JSON.stringify(draft, null, 2));

  if (!forcedType) state.cycleIndex = ((state.cycleIndex || 0) + 1) % CYCLE.length;
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2) + "\n");

  git("add", "content/generator-state.json");
  if (gitCommit(ROOT, "chore: estado de rotacion de contenido [skip ci]")) gitPush(ROOT);

  console.log(`Generado type=${type}. Armando item de queue + notificando Telegram...`);
  const r = spawnSync("node", ["scripts/generate-content.mjs", draftFile], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (r.status !== 0) throw new Error("generate-content.mjs falló");

  console.log("\nListo.");
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
