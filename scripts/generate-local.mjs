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
import {
  renderFeatureHighlight,
  renderHook,
  renderProblem,
  renderSolution,
  renderSocialProof,
  renderCtaFinal,
} from "./lib/render-template.mjs";
import { push as gitPush, commit as gitCommit } from "./lib/git.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BANK_FILE = path.join(ROOT, "content", "content-bank.json");
const STATE_FILE = path.join(ROOT, "content", "generator-state.json");
const TMP_OUT = path.join(ROOT, ".gen-tmp", "local-run");

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

  const bank = await readJson(BANK_FILE, { single: [], carousel: [] });
  const state = await readJson(STATE_FILE, {
    lastType: null,
    singleIndex: 0,
    carouselIndex: 0,
  });

  const type = forcedType || (state.lastType === "single" ? "carousel" : "single");

  if (type === "single" && bank.single.length === 0) throw new Error("content-bank.json sin entradas 'single'");
  if (type === "carousel" && bank.carousel.length === 0) throw new Error("content-bank.json sin entradas 'carousel'");

  await mkdir(TMP_OUT, { recursive: true });

  let caption, assets;

  if (type === "single") {
    const entry = bank.single[(state.singleIndex || 0) % bank.single.length];
    const out = path.join(TMP_OUT, "01.jpg");
    await renderFeatureHighlight(entry, out);
    assets = [out];
    caption = `${entry.headline.text}\n\n${entry.subtitle}\n\n${entry.cta}\n\n#iTeknology #TiendaOnline #SinCodigo`;
    state.singleIndex = (state.singleIndex || 0) + 1;
  } else {
    const entry = bank.carousel[(state.carouselIndex || 0) % bank.carousel.length];
    const paths = [
      path.join(TMP_OUT, "01.jpg"),
      path.join(TMP_OUT, "02.jpg"),
      path.join(TMP_OUT, "03.jpg"),
      path.join(TMP_OUT, "04.jpg"),
      path.join(TMP_OUT, "05.jpg"),
    ];
    await renderHook(entry.hook, paths[0]);
    await renderProblem(entry.problem, paths[1]);
    await renderSolution(entry.solution, paths[2]);
    await renderSocialProof(entry.socialProof, paths[3]);
    await renderCtaFinal(entry.ctaFinal, paths[4]);
    assets = paths;
    caption =
      `${entry.hook.hook.text}\n\n` +
      `En iTeknology ayudamos a recuperar el control de tu negocio: app propia, logística inteligente y gestión de pedidos unificada.\n\n` +
      `${entry.ctaFinal.ctaButton} 🔗 Link en bio.\n\n` +
      `#RestaurantTech #FoodTech #DeliveryTech #B2BSaaS #iTeknology`;
    state.carouselIndex = (state.carouselIndex || 0) + 1;
  }

  const draft = { type, targets: ["fb", "ig"], caption, assets };
  const draftFile = path.join(TMP_OUT, "draft.json");
  await writeFile(draftFile, JSON.stringify(draft, null, 2));

  state.lastType = type;
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
