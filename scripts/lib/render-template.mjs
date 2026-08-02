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

let logoDataUriCache = null;
async function logoDataUri() {
  if (logoDataUriCache) return logoDataUriCache;
  const buf = await readFile(LOGO_FILE);
  logoDataUriCache = `data:image/png;base64,${buf.toString("base64")}`;
  return logoDataUriCache;
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

// Renderiza el slide "Feature Highlight" (single, o 1 slide de carrusel).
// opts: { headline, subtitle, cta, icon } — icon es una key de icons.mjs
// (default rota si no se especifica).
// opts.illustrationPath: ruta a una imagen (generada por Gemini u otra fuente,
// SIN logo/texto/CTA horneado — solo la escena) para meter en la caja visual
// en vez del ícono SVG genérico. Si no se da, usa el ícono como antes.
export async function renderFeatureHighlight(opts, outPath) {
  const { headline, subtitle, cta, icon, theme = DEFAULT_THEME, illustrationPath } = opts;

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

  let html = await readFile(path.join(TEMPLATE_DIR, templateFileFor("feature-highlight", theme)), "utf8");
  html = html
    .replace("LOGO_DATA_URI", await logoDataUri())
    .replace("HEADLINE_HTML", headlineHtml(headline))
    .replace("SUBTITLE_TEXT", escapeHtml(subtitle))
    .replace("ICON_SVG", visualHtml)
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

async function renderSlide(templateFile, replacements, outPath) {
  let html = await readFile(path.join(TEMPLATE_DIR, templateFile), "utf8");
  html = html.replace("LOGO_DATA_URI", await logoDataUri());
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

// Slide 1: hook/cover. opts: { badge, hook: {text, accent}, theme }
export function renderHook(opts, outPath) {
  const theme = opts.theme || DEFAULT_THEME;
  return renderSlide(templateFileFor("slide-1-hook", theme), {
    BADGE_TEXT: escapeHtml(opts.badge),
    HOOK_HTML: headlineHtml(opts.hook),
  }, outPath);
}

// Slide 2: problema. opts: { title, items: string[], theme } (cada item = 1 dolor)
const WARN_ICON = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l10 18H2L12 3z" stroke="#DC2626" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v5M12 18h.01" stroke="#DC2626" stroke-width="2" stroke-linecap="round"/></svg>`;
export function renderProblem(opts, outPath) {
  const theme = opts.theme || DEFAULT_THEME;
  const itemsHtml = opts.items
    .map((it) => `<div class="item">${WARN_ICON}<span>${escapeHtml(it)}</span></div>`)
    .join("\n");
  return renderSlide(templateFileFor("slide-2-problem", theme), {
    TITLE_HTML: headlineHtml(opts.title),
    ITEMS_HTML: itemsHtml,
  }, outPath);
}

// Slide 3: solución. opts: { title, items: string[], theme } (cada item = 1 feature)
const CHECK_ICON = `<svg viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5 9-11" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export function renderSolution(opts, outPath) {
  const theme = opts.theme || DEFAULT_THEME;
  const itemsHtml = opts.items
    .map((it) => `<div class="item"><div class="check">${CHECK_ICON}</div><span>${escapeHtml(it)}</span></div>`)
    .join("\n");
  return renderSlide(templateFileFor("slide-3-solution", theme), {
    TITLE_HTML: headlineHtml(opts.title),
    ITEMS_HTML: itemsHtml,
  }, outPath);
}

// Slide 4: prueba social. opts: { quote, statNumber, statLabel, source, theme }
export function renderSocialProof(opts, outPath) {
  const theme = opts.theme || DEFAULT_THEME;
  return renderSlide(templateFileFor("slide-4-social-proof", theme), {
    QUOTE_HTML: escapeHtml(opts.quote),
    STAT_NUMBER: escapeHtml(opts.statNumber),
    STAT_LABEL: escapeHtml(opts.statLabel),
    SOURCE_TEXT: escapeHtml(opts.source),
  }, outPath);
}

// Slide 5: CTA final (mismo diseño azul/blanco en ambos temas — no oscuro).
// opts: { ctaHeadline, ctaButton, handle }
export function renderCtaFinal(opts, outPath) {
  return renderSlide("slide-5-cta.html", {
    CTA_HEADLINE_HTML: headlineHtml(opts.ctaHeadline),
    CTA_BUTTON_TEXT: escapeHtml(opts.ctaButton),
    HANDLE_TEXT: escapeHtml(opts.handle),
  }, outPath);
}

export { iconKeys };
