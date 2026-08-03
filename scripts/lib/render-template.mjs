// Renderiza el template real (HTML/CSS fijo, sin IA) a un JPG 1080x1080 vía
// Playwright. Layout consistente siempre — solo cambia texto + ícono.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { icons as iconsDark, iconKeys } from "../template/icons.mjs";
import { icons as iconsLight } from "../template/icons-light.mjs";

// Tema por defecto: "light" (fondo blanco) — el navy oscuro quedó descartado.
const DEFAULT_THEME = "light";
function iconSetFor(theme) {
  return theme === "dark" ? iconsDark : iconsLight;
}
function templateFileFor(base, theme) {
  return theme === "dark" ? `${base}.html` : `${base}-light.html`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(__dirname, "..", "template");
const LOGO_FILE = path.join(__dirname, "..", "..", "content", "logoiTeknology.png");
const LOGO_LONG_FILE = path.join(__dirname, "..", "..", "content", "logo iteknology largo.png");

let logoDataUriCache = null;
async function logoDataUri() {
  if (logoDataUriCache) return logoDataUriCache;
  const buf = await readFile(LOGO_FILE);
  logoDataUriCache = `data:image/png;base64,${buf.toString("base64")}`;
  return logoDataUriCache;
}

// Wordmark horizontal (sin badge circular) — usado en feature-highlight,
// más legible que el círculo pequeño.
let logoLongDataUriCache = null;
async function logoLongDataUri() {
  if (logoLongDataUriCache) return logoLongDataUriCache;
  const buf = await readFile(LOGO_LONG_FILE);
  logoLongDataUriCache = `data:image/png;base64,${buf.toString("base64")}`;
  return logoLongDataUriCache;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// headline: string simple, o { text, accent } donde `accent` es la palabra/
// frase a resaltar en azul dentro del headline.
function headlineHtml(headline) {
  if (typeof headline === "string") return escapeHtml(headline).toUpperCase();
  const { text, accent } = headline;
  const escText = escapeHtml(text);
  const escAccent = escapeHtml(accent);
  if (!escText.includes(escAccent)) return escText.toUpperCase();
  return escText
    .toUpperCase()
    .replace(escAccent.toUpperCase(), `<span class="accent">${escAccent.toUpperCase()}</span>`);
}

// Renderiza el slide "Feature Highlight" v2 (mockup grande + profundidad,
// feedback de storytelling aplicado — ver artifact aprobado 2026-08-02).
// opts: { headline, subtitle, cta, icon, illustrationPath, trustText,
//         floatText, benefits: string[] }
// opts.illustrationPath: ruta a una imagen (generada por Gemini u otra fuente,
// SIN logo/texto/CTA horneado — solo la escena) para meter en la caja visual
// en vez del ícono SVG genérico. Si no se da, usa el ícono como antes.
const BENEFIT_CHECK_ICON = `<svg viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5 9-11" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export async function renderFeatureHighlight(opts, outPath) {
  const { headline, subtitle, cta, icon, theme = DEFAULT_THEME, illustrationPath } = opts;
  const trustText = opts.trustText || "Configuración en minutos";
  const floatText = opts.floatText || "Listo";
  const benefits = opts.benefits && opts.benefits.length ? opts.benefits : [
    "Sin conocimientos técnicos", "Cambios en tiempo real", "Desde cualquier dispositivo",
  ];

  let visualHtml;
  if (illustrationPath) {
    const buf = await readFile(illustrationPath);
    const ext = path.extname(illustrationPath).slice(1) || "jpeg";
    const dataUri = `data:image/${ext};base64,${buf.toString("base64")}`;
    visualHtml = `<img src="${dataUri}" />`;
  } else {
    const icons = iconSetFor(theme);
    const iconKey = icon && icons[icon] ? icon : iconKeys[0];
    visualHtml = icons[iconKey];
  }

  const benefitsHtml = benefits
    .map((b) => `<div class="benefit"><div class="check">${BENEFIT_CHECK_ICON}</div><span>${escapeHtml(b)}</span></div>`)
    .join("\n");

  let html = await readFile(path.join(TEMPLATE_DIR, "feature-highlight-light-v2.html"), "utf8");
  html = html
    .replace("LOGO_DATA_URI", await logoLongDataUri())
    .replace("TRUST_TEXT", escapeHtml(trustText))
    .replace("HEADLINE_HTML", headlineHtml(headline))
    .replace("SUBTITLE_TEXT", escapeHtml(subtitle))
    .replace("ICON_SVG", visualHtml)
    .replace("FLOAT_TEXT", escapeHtml(floatText))
    .replace("BENEFITS_HTML", benefitsHtml)
    .replace("CTA_TEXT", escapeHtml(cta));

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.screenshot({ path: outPath, type: "jpeg", quality: 92 });
  } finally {
    await browser.close();
  }
  return outPath;
}

async function imgTag(illustrationPath) {
  if (!illustrationPath) return "";
  const buf = await readFile(illustrationPath);
  const ext = path.extname(illustrationPath).slice(1) || "jpeg";
  return `<img src="data:image/${ext};base64,${buf.toString("base64")}" />`;
}

async function renderSlide(templateFile, replacements, outPath) {
  let html = await readFile(path.join(TEMPLATE_DIR, templateFile), "utf8");
  // El logo por defecto es el badge circular; los callers pueden override
  // pasando LOGO_DATA_URI en `replacements` (ej. el wordmark horizontal).
  if (!("LOGO_DATA_URI" in replacements)) {
    replacements = { ...replacements, LOGO_DATA_URI: await logoDataUri() };
  }
  for (const [key, value] of Object.entries(replacements)) {
    html = html.replaceAll(key, value);
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.screenshot({ path: outPath, type: "jpeg", quality: 92 });
  } finally {
    await browser.close();
  }
  return outPath;
}

// Formato B2 aprobado (2026-08-02): Hook (imagen) -> Problema (imagen) ->
// Consecuencia (texto, fondo oscuro, sin imagen -- variación de ritmo
// deliberada) -> Solución (imagen) -> Resultado+CTA (imagen). Storytelling:
// cada carrusel debe resolver un problema real con iTeknology.

const BADGE_TONES = {
  alert: {
    wave: "linear-gradient(90deg, #DC2626 0%, #2563EB 100%)",
    bg: "rgba(220,38,38,0.08)",
    border: "rgba(220,38,38,0.3)",
    color: "#DC2626",
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l10 18H2L12 3z" stroke="#DC2626" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v5M12 18h.01" stroke="#DC2626" stroke-width="2" stroke-linecap="round"/></svg>`,
  },
  promise: {
    wave: "linear-gradient(90deg, #2563EB 0%, #60A5FA 100%)",
    bg: "rgba(37,99,235,0.08)",
    border: "rgba(37,99,235,0.3)",
    color: "#2563EB",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
  },
};

// Slide 1: hook/cover CON ilustración. opts: { badgeText, tone: "alert"|"promise",
// hook: {text, accent}, illustrationPath }. El hook debe ser una promesa/
// curiosidad, no una pregunta sobre el problema (feedback de storytelling).
export async function renderHook(opts, outPath) {
  const tone = BADGE_TONES[opts.tone] || BADGE_TONES.alert;
  return renderSlide("slide-1-hook-light.html", {
    BADGE_WAVE: tone.wave,
    BADGE_BG: tone.bg,
    BADGE_BORDER: tone.border,
    BADGE_COLOR: tone.color,
    BADGE_ICON: tone.icon,
    BADGE_TEXT: escapeHtml(opts.badgeText),
    HOOK_HTML: headlineHtml(opts.hook),
    ILLUSTRATION_IMG: await imgTag(opts.illustrationPath),
    LOGO_DATA_URI: await logoLongDataUri(),
  }, outPath);
}

// Slide 2: problema (identificación — "eso me pasa"). opts: { eyebrow, title,
// items: string[], illustrationPath }
export async function renderProblem(opts, outPath) {
  const itemsHtml = opts.items
    .map((it) => `<div class="item"><div class="bullet"></div><span>${escapeHtml(it)}</span></div>`)
    .join("\n");
  return renderSlide("slide-2-problem-light.html", {
    EYEBROW_TEXT: escapeHtml(opts.eyebrow || "¿TE SUENA FAMILIAR?"),
    TITLE_HTML: headlineHtml(opts.title),
    ITEMS_HTML: itemsHtml,
    ILLUSTRATION_IMG: await imgTag(opts.illustrationPath),
  }, outPath);
}

// Slide 3: consecuencia — narrativa corta y emocional, fondo oscuro (rompe
// el ritmo visual a propósito), SIN imagen. opts: { lines: [{text, strike}],
// payoff }. La última línea siempre se resalta (final).
export function renderConsequence(opts, outPath) {
  const n = opts.lines.length;
  const linesHtml = opts.lines
    .map((l, i) => {
      const cls = i === n - 1 ? "line final" : l.strike ? "line strike" : "line";
      return `<div class="${cls}">${escapeHtml(l.text)}</div>`;
    })
    .join("\n");
  return renderSlide("slide-consequence.html", {
    LINES_HTML: linesHtml,
    PAYOFF_TEXT: escapeHtml(opts.payoff),
  }, outPath);
}

// Slide 4: solución CON ilustración/mockup + chip flotante. opts: { title,
// items: string[], chipText, illustrationPath }. Copy centrado en el
// resultado de negocio, no en features técnicas (feedback de storytelling).
const CHECK_ICON = `<svg viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5 9-11" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export async function renderSolution(opts, outPath) {
  const itemsHtml = opts.items
    .map((it) => `<div class="item"><div class="check">${CHECK_ICON}</div><span>${escapeHtml(it)}</span></div>`)
    .join("\n");
  return renderSlide("slide-3-solution-light.html", {
    TITLE_HTML: headlineHtml(opts.title),
    ITEMS_HTML: itemsHtml,
    CHIP_TEXT: escapeHtml(opts.chipText),
    ILLUSTRATION_IMG: await imgTag(opts.illustrationPath),
  }, outPath);
}

// Slide 5: Resultado + CTA, CON ilustración, fondo azul sólido.
// opts: { result, ctaHeadline, ctaButton, handle, illustrationPath }
export async function renderCtaFinal(opts, outPath) {
  return renderSlide("slide-5-cta.html", {
    RESULT_TEXT: escapeHtml(opts.result),
    CTA_HEADLINE_HTML: headlineHtml(opts.ctaHeadline),
    CTA_BUTTON_TEXT: escapeHtml(opts.ctaButton),
    HANDLE_TEXT: escapeHtml(opts.handle),
    ILLUSTRATION_IMG: await imgTag(opts.illustrationPath),
    LOGO_DATA_URI: await logoDataUri(),
  }, outPath);
}

export { iconKeys };
