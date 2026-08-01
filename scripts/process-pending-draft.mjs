// Corre en GitHub Actions (generate-queue.yml), disparado cuando el routine
// cloud comitea content/pending-draft.json. Toma ese draft (copy + prompts de
// imagen, SIN imágenes todavía), genera las imágenes con Gemini headless
// (GEMINI_SESSION_STATE, Secret real) y arma el item de queue final.
//
// pending-draft.json:
//   { "type": "single|carousel|reel", "targets": ["fb","ig"], "caption": "...",
//     "prompts": ["prompt imagen 1", ...] }
//
// Env requerido: GEMINI_SESSION_STATE, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
//                GITHUB_REPOSITORY (lo pone Actions solo)

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DRAFT_FILE = path.join(ROOT, "content", "pending-draft.json");
const TMP_DIR = path.join(ROOT, ".gen-tmp", "pending");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} falló (exit ${r.status})`);
}

function git(...args) {
  run("git", args);
}

async function main() {
  let draft;
  try {
    draft = JSON.parse(await readFile(DRAFT_FILE, "utf8"));
  } catch {
    console.log("No hay content/pending-draft.json — nada que procesar.");
    return;
  }

  const { type, caption } = draft;
  const targets = draft.targets || ["fb", "ig"];
  const prompts = draft.prompts || [];
  if (!type || !caption || prompts.length === 0) {
    throw new Error("pending-draft.json incompleto (falta type, caption o prompts)");
  }

  await mkdir(TMP_DIR, { recursive: true });
  const promptsFile = path.join(TMP_DIR, "prompts.json");
  await writeFile(promptsFile, JSON.stringify(prompts));

  console.log(`Generando ${prompts.length} imagen(es) vía Gemini para draft type=${type}...`);
  run("node", ["scripts/generate-cloud.mjs", promptsFile, TMP_DIR]);

  const assets = prompts.map((_, i) => path.join(TMP_DIR, `${String(i + 1).padStart(2, "0")}.jpg`));

  const draftForQueue = { type, targets, caption, assets };
  const draftForQueueFile = path.join(TMP_DIR, "draft-for-queue.json");
  await writeFile(draftForQueueFile, JSON.stringify(draftForQueue));

  // Borrar el pending-draft ANTES de generate-content.mjs para que su commit
  // (que sí hace push) se lleve también la limpieza del draft procesado.
  await rm(DRAFT_FILE, { force: true });
  git("add", "content/pending-draft.json");
  const r = spawnSync(
    "git",
    ["-c", "user.name=iteknology-bot", "-c", "user.email=bot@iteknology.local", "commit", "-m", "chore: draft procesado [skip ci]"],
    { cwd: ROOT, stdio: "inherit" }
  );
  if (r.status === 0) git("push");

  console.log("Armando item de queue final...");
  run("node", ["scripts/generate-content.mjs", draftForQueueFile]);

  await rm(TMP_DIR, { recursive: true, force: true });
  console.log("Listo.");
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
