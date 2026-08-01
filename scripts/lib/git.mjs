// Push confiable: en esta máquina, el credential.helper "manager" (Git
// Credential Manager, GUI de Windows) se cuelga esperando un popup invisible
// cuando corre sin sesión interactiva (Task Scheduler, subprocess, etc).
// Bypassea GCM usando el token de `gh auth token` directo por header HTTP.

import { spawnSync } from "node:child_process";

function ghToken() {
  const r = spawnSync("gh", ["auth", "token"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("No pude obtener token de gh auth (¿gh CLI logueado?)");
  return r.stdout.trim();
}

function remoteUrlWithToken(cwd, token) {
  const r = spawnSync("git", ["remote", "get-url", "origin"], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error("No pude leer el remote origin");
  const url = r.stdout.trim(); // https://github.com/owner/repo.git
  const m = url.match(/^https:\/\/github\.com\/(.+)$/);
  if (!m) throw new Error(`Remote no es HTTPS de github.com: ${url}`);
  return `https://x-access-token:${token}@github.com/${m[1]}`;
}

export function push(cwd) {
  const token = ghToken();
  const authUrl = remoteUrlWithToken(cwd, token);
  // credential.helper vacío: evita que Git Credential Manager (GUI, se
  // cuelga esperando un popup invisible en subprocess/Task Scheduler)
  // intercepte la autenticación — el token va directo en la URL.
  const r = spawnSync(
    "git",
    ["-c", "credential.helper=", "push", authUrl, "HEAD:main"],
    { cwd, stdio: "inherit" }
  );
  if (r.status !== 0) throw new Error("git push falló");
}

export function commit(cwd, message) {
  return spawnSync(
    "git",
    ["-c", "user.name=iteknology-bot", "-c", "user.email=bot@iteknology.local", "commit", "-m", message],
    { cwd, stdio: "inherit" }
  ).status === 0;
}
