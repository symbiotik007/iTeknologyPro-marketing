// Lanza Chrome con debug port (CDP) en un PERFIL DEDICADO para el generador.
//
// Por qué dedicado: Chrome 136+ desactiva --remote-debugging-port en el perfil por
// defecto (seguridad). Copiar el perfil corporativo abre sesión "guest" (las cookies
// no se descifran). Solución fiable: un perfil aparte donde inicias sesión en Gemini
// UNA sola vez; la sesión queda guardada ahí para siempre.
//
// Uso:  npm run chrome
//   1ª vez → inicia sesión en Gemini (Braviant o personal) en la ventana que abre.
//   Siguientes veces → ya queda logueado, solo verifica y corre  npm run generate.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = process.env.CDP_PORT || "9222";
const DST = process.env.GEN_USER_DATA_DIR || path.join(os.homedir(), "AppData", "Local", "itk-gen-chrome");

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];
const chromePath = process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chromePath) { console.error("No encontré chrome.exe. Usa CHROME_PATH=..."); process.exit(1); }

const firstTime = !existsSync(path.join(DST, "Default"));

console.log("Chrome:", chromePath);
console.log("Perfil dedicado:", DST);
console.log("Debug port:", PORT);
if (firstTime) console.log("\n⚠ PRIMERA VEZ: inicia sesión en Gemini en la ventana que abre.\n");

const child = spawn(chromePath, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${DST}`,
  "--no-first-run",
  "--no-default-browser-check",
  "https://gemini.google.com/app",
], { detached: true, stdio: "ignore" });
child.unref();

console.log("Chrome lanzado. Cuando Gemini esté logueado:  npm run generate\n");
