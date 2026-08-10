// Corre 2x/día vía GitHub Actions (publish-queue.yml). Revisa content/queue/,
// chequea si cada item fue aprobado/rechazado por Telegram, publica lo que
// corresponda (single/carousel/reel, FB+IG) y mueve todo a content/published/.
//
// Si la queue está vacía (nada generado todavía, o falló el agente generador),
// cae al comportamiento viejo: node scripts/post.mjs (rotación fija) — así la
// cadencia de publicación nunca se rompe.
//
// Env requerido: META_PAGE_ID, META_IG_USER_ID, META_ACCESS_TOKEN,
//                TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// Env opcional:  RAW_BASE (si no, usa GITHUB_REPOSITORY/GITHUB_REF_NAME)
//                DRY_RUN=1 (no publica de verdad, solo imprime)

import { readFile, writeFile, readdir, rename, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getPageToken,
  postFacebookPhoto,
  postFacebookCarousel,
  postFacebookVideo,
  postInstagramImage,
  postInstagramCarousel,
  postInstagramReel,
} from "./lib/graph.mjs";
import { getUpdates, findDecision, answerCallbackQuery, sendMessage } from "./lib/telegram.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const QUEUE_DIR = path.join(ROOT, "content", "queue");
const PUBLISHED_DIR = path.join(ROOT, "content", "published");
const SKIPPED_DIR = path.join(ROOT, "content", "skipped-posts");
const TG_STATE_FILE = path.join(ROOT, "content", "telegram-state.json");

const DRY = process.env.DRY_RUN === "1";

function need(name) {
  const v = process.env[name];
  if (!v && !DRY) throw new Error(`Falta la variable de entorno ${name}`);
  return v || `<${name}>`;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function rawUrl(relPath) {
  if (process.env.RAW_BASE) return `${process.env.RAW_BASE.replace(/\/$/, "")}/${relPath}`;
  const repo = process.env.GITHUB_REPOSITORY;
  const ref = process.env.GITHUB_REF_NAME || "main";
  if (!repo) throw new Error("Sin GITHUB_REPOSITORY ni RAW_BASE: no puedo armar la URL pública");
  return `https://raw.githubusercontent.com/${repo}/${ref}/${relPath}`;
}

function git(...args) {
  const r = spawnSync("git", args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} falló`);
}

async function listPendingItems() {
  let entries;
  try {
    entries = await readdir(QUEUE_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const items = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const metaFile = path.join(QUEUE_DIR, e.name, "meta.json");
    const meta = await readJson(metaFile, null);
    if (meta && meta.status === "pending") items.push({ dir: e.name, meta });
  }
  return items;
}

async function persistPartialResults(itemDir, meta, results) {
  const updated = { ...meta, results: { ...(meta.results || {}), ...results } };
  await writeFile(path.join(itemDir, "meta.json"), JSON.stringify(updated, null, 2) + "\n");
  return updated;
}

async function publishItem(item, pageToken, pageId, igUserId) {
  let { meta } = item;
  const itemDir = path.join(QUEUE_DIR, item.dir);
  const assetsDir = path.join(itemDir, "assets");
  const caption = await readFile(path.join(itemDir, "caption.txt"), "utf8");
  // Resultados ya persistidos en meta.json (de una corrida anterior que falló
  // a mitad de camino) — no volvemos a publicar en un target que ya tiene id.
  const results = { ...(meta.results || {}) };

  // Publica en `target` solo si no está ya en `results`, y si sale bien lo
  // persiste al toque en meta.json — así un fallo posterior (ej. IG después
  // de FB) no hace que la próxima corrida reposte FB de nuevo.
  async function doTarget(target, fn) {
    if (results[target]) {
      console.log(`  (${target} ya publicado antes: ${results[target]}, salto)`);
      return;
    }
    results[target] = await fn();
    meta = await persistPartialResults(itemDir, meta, results);
  }

  if (meta.type === "single") {
    const url = rawUrl(`content/queue/${item.dir}/assets/01.jpg`);
    if (DRY) {
      console.log(`  DRY: postearía imagen única ${url}`);
    } else {
      if (meta.targets.includes("fb")) await doTarget("fb", () => postFacebookPhoto(pageId, pageToken, url, caption));
      if (meta.targets.includes("ig")) await doTarget("ig", () => postInstagramImage(igUserId, pageToken, url, caption));
    }
  } else if (meta.type === "carousel") {
    const files = (await readdir(assetsDir)).filter((f) => /\.jpe?g$/i.test(f)).sort();
    const urls = files.map((f) => rawUrl(`content/queue/${item.dir}/assets/${f}`));
    if (DRY) {
      console.log(`  DRY: postearía carrusel de ${urls.length} imágenes`);
    } else {
      if (meta.targets.includes("fb")) await doTarget("fb", () => postFacebookCarousel(pageId, pageToken, urls, caption));
      if (meta.targets.includes("ig")) await doTarget("ig", () => postInstagramCarousel(igUserId, pageToken, urls, caption));
    }
  } else if (meta.type === "reel") {
    const url = rawUrl(`content/queue/${item.dir}/assets/video.mp4`);
    if (DRY) {
      console.log(`  DRY: postearía reel ${url}`);
    } else {
      if (meta.targets.includes("fb")) await doTarget("fb", () => postFacebookVideo(pageId, pageToken, url, caption));
      if (meta.targets.includes("ig")) await doTarget("ig", () => postInstagramReel(igUserId, pageToken, url, caption));
    }
  } else {
    throw new Error(`type desconocido: ${meta.type}`);
  }

  return results;
}

async function moveToPublished(item, status, results) {
  const itemDir = path.join(QUEUE_DIR, item.dir);
  // Los rechazados van a content/skipped-posts/, no a published/ (ese queda
  // solo para lo que sí se publicó de verdad).
  const destBase = status === "rejected" ? SKIPPED_DIR : PUBLISHED_DIR;
  const destDir = path.join(destBase, item.dir);
  const meta = { ...item.meta, status, results: results || null, decidedAt: new Date().toISOString() };
  await writeFile(path.join(itemDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  await mkdir(destBase, { recursive: true });
  await rename(itemDir, destDir);
}

async function fallbackToOldRotation() {
  console.log("Queue vacía: cayendo al fallback (rotación vieja de content/images/).");
  if (DRY) {
    const r = spawnSync("node", ["scripts/post.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, DRY_RUN: "1" },
    });
    if (r.status !== 0) throw new Error("fallback post.mjs (dry) falló");
    return;
  }
  const r = spawnSync("node", ["scripts/post.mjs"], { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) throw new Error("fallback post.mjs falló");
}

async function main() {
  const pageId = need("META_PAGE_ID");
  const igUserId = need("META_IG_USER_ID");
  const token = need("META_ACCESS_TOKEN");

  const items = await listPendingItems();
  if (items.length === 0) {
    await fallbackToOldRotation();
    return;
  }

  console.log(`Items pendientes en queue: ${items.length}`);

  const tgState = await readJson(TG_STATE_FILE, { lastUpdateId: null });
  const updates = await getUpdates(tgState.lastUpdateId != null ? tgState.lastUpdateId + 1 : undefined);
  if (updates.length > 0) {
    tgState.lastUpdateId = Math.max(...updates.map((u) => u.update_id));
  }

  const pageToken = DRY ? "<PAGE_TOKEN>" : await getPageToken(pageId, token);
  let changed = false;

  for (const item of items) {
    console.log(`\n▶ ${item.dir} (${item.meta.type})`);
    const decision = findDecision(updates, item.meta.id);

    if (decision?.decision === "reject") {
      console.log("  ❌ Rechazado por Telegram.");
      if (!DRY) {
        // answerCallbackQuery es solo cosmético (quita el spinner del botón).
        // Si el click ya expiró (Telegram lo vence rápido), esto falla con
        // "query is too old" -- nunca debe tumbar la publicación real.
        await answerCallbackQuery(decision.callbackQueryId, "Cancelado").catch((e) =>
          console.log(`  (answerCallbackQuery: ${e.message})`)
        );
        await sendMessage(`❌ Cancelado: ${item.meta.id}`);
        await moveToPublished(item, "rejected", null);
        changed = true;
      }
      continue;
    }

    if (decision?.decision === "approve") {
      console.log("  ✅ Aprobado por Telegram, publicando…");
      if (!DRY) {
        await answerCallbackQuery(decision.callbackQueryId, "Publicando…").catch((e) =>
          console.log(`  (answerCallbackQuery: ${e.message})`)
        );
      }
    } else {
      console.log("  ⏱ Sin respuesta, publicando de todas formas (ventana vencida)…");
    }

    try {
      const results = await publishItem(item, pageToken, pageId, igUserId);
      console.log(`  Publicado:`, results);
      if (!DRY) {
        await sendMessage(`✅ Publicado: ${item.meta.id}\n${JSON.stringify(results)}`);
        await moveToPublished(item, "published", results);
        changed = true;
      }
    } catch (err) {
      console.error(`  ✗ Error publicando ${item.dir}: ${err.message}`);
      if (!DRY) await sendMessage(`⚠️ Error publicando ${item.meta.id}: ${err.message}`);
      // No se mueve: queda en queue como pending para reintentar en la próxima corrida.
    }
  }

  if (!DRY) {
    await writeFile(TG_STATE_FILE, JSON.stringify(tgState, null, 2) + "\n");
    git("add", "content/queue", "content/published", "content/skipped-posts", "content/telegram-state.json");
    const r = spawnSync(
      "git",
      ["-c", "user.name=iteknology-bot", "-c", "user.email=bot@iteknology.local", "commit", "-m", "chore: publish-queue [skip ci]"],
      { cwd: ROOT, stdio: "inherit" }
    );
    if (r.status === 0) git("push");
    else console.log("  (sin cambios que commitear)");
  } else if (changed) {
    console.log("\nDRY_RUN: no se hizo commit/push de los cambios de estado.");
  }

  console.log("\nListo.");
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
