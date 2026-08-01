// Toma un "draft" (copy + imágenes ya exportadas de Canva) y arma un item de
// content/queue/<id>/ listo para aprobación + publicación. Rol mecánico: NO
// escribe copy ni diseña nada — eso lo hace el agente Claude programado antes
// de llamar este script.
//
// Uso:
//   node scripts/generate-content.mjs draft.json
//
// draft.json:
//   {
//     "type": "single" | "carousel" | "reel",
//     "targets": ["fb","ig"],       // opcional, default fb+ig
//     "caption": "texto del post",
//     "assets": ["ruta/a/img1.jpg", "ruta/a/img2.jpg", ...]
//               // para "single": 1 imagen. Para "carousel": 2-10 imágenes.
//               // Para "reel": las imágenes de las slides (se arma el mp4 acá).
//   }
//
// Env requerido: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// Env para armar la URL pública (una de las dos):
//   RAW_BASE  o  GITHUB_REPOSITORY (+ opcional GITHUB_REF_NAME, default "main")

import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSlideshow } from "./lib/video.mjs";
import { sendPhoto, sendVideo, sendCarouselPreview, approvalKeyboard } from "./lib/telegram.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const QUEUE_DIR = path.join(ROOT, "content", "queue");

function git(...args) {
  const r = spawnSync("git", args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} falló`);
}

function rawUrl(relPath) {
  if (process.env.RAW_BASE) return `${process.env.RAW_BASE.replace(/\/$/, "")}/${relPath}`;
  const repo = process.env.GITHUB_REPOSITORY;
  const ref = process.env.GITHUB_REF_NAME || "main";
  if (!repo) throw new Error("Sin GITHUB_REPOSITORY ni RAW_BASE: no puedo armar la URL pública");
  return `https://raw.githubusercontent.com/${repo}/${ref}/${relPath}`;
}

function makeId(type) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `${type}-${stamp}`;
}

async function main() {
  const draftPath = process.argv[2];
  if (!draftPath) throw new Error("Uso: node scripts/generate-content.mjs draft.json");

  const draft = JSON.parse(await readFile(draftPath, "utf8"));
  const { type, caption } = draft;
  const targets = draft.targets || ["fb", "ig"];
  const assets = draft.assets || [];

  if (!["single", "carousel", "reel"].includes(type)) {
    throw new Error(`type inválido: ${type} (debe ser single|carousel|reel)`);
  }
  if (!caption) throw new Error("Falta caption en el draft");
  if (assets.length === 0) throw new Error("Falta al menos 1 asset en el draft");
  if (type === "single" && assets.length !== 1) {
    throw new Error("type=single requiere exactamente 1 imagen en assets");
  }
  if (type === "carousel" && (assets.length < 2 || assets.length > 10)) {
    throw new Error("type=carousel requiere entre 2 y 10 imágenes");
  }

  const id = makeId(type);
  const itemDir = path.join(QUEUE_DIR, id);
  const assetsDir = path.join(itemDir, "assets");
  await mkdir(assetsDir, { recursive: true });

  console.log(`Armando queue item ${id} (${type}, ${assets.length} asset(s))`);

  let publicUrls = [];
  if (type === "reel") {
    // Guarda las slides fuente (para referencia) y arma el video final.
    const slidePaths = [];
    for (let i = 0; i < assets.length; i++) {
      const dest = path.join(assetsDir, `slide-${String(i + 1).padStart(2, "0")}.jpg`);
      await copyFile(assets[i], dest);
      slidePaths.push(dest);
    }
    const videoPath = path.join(assetsDir, "video.mp4");
    buildSlideshow(slidePaths, videoPath);
    publicUrls = [rawUrl(`content/queue/${id}/assets/video.mp4`)];
  } else {
    for (let i = 0; i < assets.length; i++) {
      const filename = `${String(i + 1).padStart(2, "0")}.jpg`;
      await copyFile(assets[i], path.join(assetsDir, filename));
      publicUrls.push(rawUrl(`content/queue/${id}/assets/${filename}`));
    }
  }

  await writeFile(path.join(itemDir, "caption.txt"), caption);

  const meta = {
    id,
    type,
    targets,
    createdAt: new Date().toISOString(),
    status: "pending",
    telegramMessageId: null,
  };
  await writeFile(path.join(itemDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");

  // Publicar el contenido en el repo ANTES de avisar por Telegram: la URL
  // pública (raw.githubusercontent.com) solo sirve una vez que el push llegó.
  git("add", path.join("content", "queue", id));
  git(
    "-c", "user.name=iteknology-bot",
    "-c", "user.email=bot@iteknology.local",
    "commit", "-m", `chore: nuevo post en queue (${id}) [skip ci]`
  );
  git("push");
  console.log("  commit + push ok");

  const keyboard = approvalKeyboard(id);
  const previewCaption = `🆕 *${type.toUpperCase()}* — ${id}\n\n${caption}`;
  let tgResult;
  if (type === "single") {
    tgResult = await sendPhoto(publicUrls[0], previewCaption, { replyMarkup: keyboard });
  } else if (type === "reel") {
    tgResult = await sendVideo(publicUrls[0], previewCaption, { replyMarkup: keyboard });
  } else {
    // carousel: preview de álbum + mensaje de botones aparte
    const imgUrls = [];
    for (let i = 0; i < assets.length; i++) {
      imgUrls.push(rawUrl(`content/queue/${id}/assets/${String(i + 1).padStart(2, "0")}.jpg`));
    }
    tgResult = await sendCarouselPreview(imgUrls, previewCaption, { replyMarkup: keyboard });
  }
  console.log(`  Telegram enviado, message_id: ${tgResult.message_id}`);

  meta.telegramMessageId = tgResult.message_id;
  await writeFile(path.join(itemDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  git("add", path.join("content", "queue", id, "meta.json"));
  git(
    "-c", "user.name=iteknology-bot",
    "-c", "user.email=bot@iteknology.local",
    "commit", "-m", `chore: telegram message id para ${id} [skip ci]`
  );
  git("push");

  console.log(`\nListo. Queue item ${id} esperando aprobación en Telegram.`);
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
