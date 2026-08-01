// Ciclo completo de generación, 100% LOCAL (sin nube, sin routine, sin GitHub
// Actions para el diseño). Pensado para correr 2x/día vía Task Scheduler de
// Windows en esta máquina:
//   1. Elige el siguiente prompt (o 5, si carousel/reel) sin usar de
//      content/prompts-vault.md, los marca -USED.
//   2. Genera la(s) imagen(es) con Gemini headless (scripts/lib/gemini.mjs +
//      la sesión exportada localmente — NO necesita Chrome abierto).
//   3. Arma el draft.json y llama scripts/generate-content.mjs, que ya arma
//      la queue, comitea+pushea, y notifica Telegram con botones.
//
// Requiere:
//   - Sesión Gemini exportada local: node scripts/export-gemini-session.mjs
//     (deja .gen-tmp/gemini-storage-state.json — NO se sube a git)
//   - TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID / GITHUB_REPOSITORY en el entorno
//     (ver .env, cargado a mano o vía Task Scheduler con "cmd /c set X=... && node ...")
//
// Uso:  node scripts/generate-local.mjs [single|carousel|reel]
//       (si no se pasa tipo, rota solo entre single/carousel usando
//        content/generator-state.json)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseVault, toJpeg1080, askGeminiForImage } from "./lib/gemini.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const VAULT = path.join(ROOT, "content", "prompts-vault.md");
const COPY_FILE = path.join(ROOT, "content", "copy.json");
const STATE_FILE = path.join(ROOT, "content", "generator-state.json");
const SESSION_FILE = path.join(ROOT, ".gen-tmp", "gemini-storage-state.json");
const TMP_OUT = path.join(ROOT, ".gen-tmp", "local-run");

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function main() {
  const forcedType = process.argv[2];

  const md = await readFile(VAULT, "utf8");
  const { lines, blocks } = parseVault(md);
  const pending = blocks.filter((b) => !b.used);
  if (pending.length === 0) {
    throw new Error("No hay prompts sin usar en content/prompts-vault.md — agrega más.");
  }

  const state = await readJson(STATE_FILE, { lastType: null, index: 0 });
  const type = forcedType || (state.lastType === "single" ? "carousel" : "single");
  const need = type === "single" ? 1 : 5;

  if (pending.length < need) {
    throw new Error(`Faltan prompts sin usar (necesito ${need}, hay ${pending.length}).`);
  }

  const chosen = pending.slice(0, need);

  const copy = await readJson(COPY_FILE, []);
  const caption = copy.length > 0 ? copy[state.index % copy.length] : chosen[0].title;

  console.log(`Generando type=${type} con ${chosen.length} prompt(s)...`);

  const sessionRaw = await readFile(SESSION_FILE, "utf8").catch(() => {
    throw new Error(
      `Falta ${SESSION_FILE}. Corre primero: npm run chrome (login Gemini) + node scripts/export-gemini-session.mjs`
    );
  });

  await mkdir(TMP_OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: SESSION_FILE });
  const assets = [];
  try {
    for (let i = 0; i < chosen.length; i++) {
      const n = String(i + 1).padStart(2, "0");
      console.log(`  [${n}] ${chosen[i].title}`);
      const page = await context.newPage();
      try {
        const raw = path.join(TMP_OUT, `raw-${n}.png`);
        const saved = await askGeminiForImage(page, chosen[i].prompt, raw);
        if (!saved) throw new Error("No apareció imagen a tiempo.");
        const out = path.join(TMP_OUT, `${n}.jpg`);
        toJpeg1080(raw, out);
        assets.push(out);
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  // Marcar prompts usados en el vault
  for (const b of chosen) {
    const imgName = path.basename(assets[chosen.indexOf(b)]);
    lines[b.titleLine] = lines[b.titleLine].replace(/\s*$/, ` -USED → ${imgName}`);
  }
  await writeFile(VAULT, lines.join("\n"));

  const draft = { type, targets: ["fb", "ig"], caption, assets };
  const draftFile = path.join(TMP_OUT, "draft.json");
  await writeFile(draftFile, JSON.stringify(draft, null, 2));

  state.lastType = type;
  state.index = (state.index || 0) + 1;
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2) + "\n");

  const { spawnSync } = await import("node:child_process");
  function git(...args) {
    const r = spawnSync("git", args, { cwd: ROOT, stdio: "inherit" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} falló`);
  }
  git("add", "content/prompts-vault.md", "content/generator-state.json");
  const c = spawnSync(
    "git",
    ["-c", "user.name=iteknology-bot", "-c", "user.email=bot@iteknology.local", "commit", "-m", "chore: prompts usados + estado de rotacion [skip ci]"],
    { cwd: ROOT, stdio: "inherit" }
  );
  if (c.status === 0) git("push");

  console.log("Armando item de queue + notificando Telegram...");
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
