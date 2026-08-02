// Set fijo de íconos de línea (SVG inline), un color de acento, reusados por
// ángulo de contenido. Nada de IA generando el ícono — así el template es
// consistente siempre.

const STROKE = "#1E40AF";
const W = 2.5;

export const icons = {
  dispatch: `
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="45" width="50" height="30" rx="4" stroke="${STROKE}" stroke-width="${W}"/>
      <path d="M60 55h18l12 14v6H60V55z" stroke="${STROKE}" stroke-width="${W}"/>
      <circle cx="28" cy="80" r="7" stroke="${STROKE}" stroke-width="${W}"/>
      <circle cx="76" cy="80" r="7" stroke="${STROKE}" stroke-width="${W}"/>
      <path d="M18 30l8-10M30 24l4-12M46 24l-2-12" stroke="${STROKE}" stroke-width="${W}" stroke-linecap="round"/>
    </svg>`,
  store: `
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 35l6-18h58l6 18" stroke="${STROKE}" stroke-width="${W}" stroke-linejoin="round"/>
      <path d="M15 35v40h70V35" stroke="${STROKE}" stroke-width="${W}"/>
      <path d="M15 35a10 10 0 0020 0 10 10 0 0020 0 10 10 0 0020 0 10 10 0 0020 0" stroke="${STROKE}" stroke-width="${W}"/>
      <rect x="42" y="55" width="16" height="20" stroke="${STROKE}" stroke-width="${W}"/>
    </svg>`,
  checkout: `
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="15" y="30" width="70" height="46" rx="6" stroke="${STROKE}" stroke-width="${W}"/>
      <path d="M15 44h70" stroke="${STROKE}" stroke-width="${W}"/>
      <rect x="26" y="56" width="22" height="10" rx="2" stroke="${STROKE}" stroke-width="${W}"/>
      <path d="M65 60l6 6 10-12" stroke="${STROKE}" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  dashboard: `
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="12" y="15" width="76" height="56" rx="6" stroke="${STROKE}" stroke-width="${W}"/>
      <path d="M24 55l14-16 12 10 18-20" stroke="${STROKE}" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M30 80h40M50 71v9" stroke="${STROKE}" stroke-width="${W}" stroke-linecap="round"/>
    </svg>`,
  clock: `
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="52" r="34" stroke="${STROKE}" stroke-width="${W}"/>
      <path d="M50 32v20l14 10" stroke="${STROKE}" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M38 12h24" stroke="${STROKE}" stroke-width="${W}" stroke-linecap="round"/>
    </svg>`,
  growth: `
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 78L38 52l16 14 31-36" stroke="${STROKE}" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M70 30h16v16" stroke="${STROKE}" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
};

export const iconKeys = Object.keys(icons);
