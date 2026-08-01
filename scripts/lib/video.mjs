// Arma un "reel" (slideshow animado) a partir de N imágenes 1080x1080, vía ffmpeg.
// Cada slide dura SLIDE_SECONDS con un leve zoom (Ken Burns) y transición cruzada
// (xfade) hacia la siguiente. Salida: mp4 1080x1080, sin audio (v1).
//
// Requiere ffmpeg en PATH (ya usado por scripts/generate.mjs).

import { spawnSync } from "node:child_process";

const SLIDE_SECONDS = 3.5;
const XFADE_SECONDS = 0.6;
const FPS = 30;
const SIZE = 1080;

export function buildSlideshow(imagePaths, outPath) {
  if (!Array.isArray(imagePaths) || imagePaths.length < 1) {
    throw new Error("buildSlideshow necesita al menos 1 imagen");
  }

  // OJO: no ponemos -t en el input. zoompan interpreta "d" como frames a sostener
  // por CADA frame de entrada, así que si el input loop ya entrega varios frames
  // repetidos (por tener -t), la duración real se multiplica sin control. Dejamos
  // el loop infinito y usamos -frames:v al final para cortar exacto.
  const inputs = [];
  for (const img of imagePaths) {
    inputs.push("-loop", "1", "-i", img);
  }

  const n = imagePaths.length;
  const zoompanFrames = Math.round((SLIDE_SECONDS + XFADE_SECONDS) * FPS);

  // Por cada input: escala/crop a cuadrado + zoompan sutil (Ken Burns), etiquetado [v0]..[vN-1]
  const perInput = imagePaths
    .map(
      (_, i) =>
        `[${i}:v]scale=${SIZE * 1.15}:${SIZE * 1.15}:force_original_aspect_ratio=increase,` +
        `crop=${SIZE * 1.15}:${SIZE * 1.15},` +
        `zoompan=z='min(zoom+0.0008,1.08)':d=${zoompanFrames}:s=${SIZE}x${SIZE}:fps=${FPS},` +
        `format=yuv420p[v${i}]`
    )
    .join(";");

  // Encadena xfade entre v0..v(n-1): [v0][v1]xfade=...[x0]; [x0][v2]xfade=...[x1]; ...
  let chain = "";
  let prevLabel = "v0";
  const offsets = [];
  let cursor = SLIDE_SECONDS; // primer corte ocurre al terminar el primer slide "puro"
  for (let i = 1; i < n; i++) {
    const outLabel = i === n - 1 ? "vout" : `x${i}`;
    chain += `;[${prevLabel}][v${i}]xfade=transition=fade:duration=${XFADE_SECONDS}:offset=${cursor.toFixed(2)}[${outLabel}]`;
    offsets.push(cursor);
    prevLabel = outLabel;
    cursor += SLIDE_SECONDS;
  }
  const finalLabel = n === 1 ? "v0" : prevLabel;

  const filterComplex = perInput + chain;

  // Duración total esperada: primer slide completo + (n-1) tramos de SLIDE_SECONDS,
  // más el remanente de cola cubierto por el último xfade.
  const totalSeconds = SLIDE_SECONDS + (n - 1) * SLIDE_SECONDS + (n > 1 ? XFADE_SECONDS : 0);
  const totalFrames = Math.round(totalSeconds * FPS);

  const args = [
    "-y",
    "-loglevel",
    "error",
    ...inputs,
    "-filter_complex",
    filterComplex,
    "-map",
    `[${finalLabel}]`,
    "-frames:v",
    String(totalFrames),
    "-r",
    String(FPS),
    "-pix_fmt",
    "yuv420p",
    outPath,
  ];

  const r = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg falló al armar el slideshow");
  return outPath;
}
