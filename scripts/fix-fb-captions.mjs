// Uso puntual (una sola vez): actualiza el `message` de posts de Facebook ya
// publicados para reflejar el dominio nuevo (iteknology.co). Instagram NO
// soporta editar el caption de un post ya publicado vía Graph API -- por eso
// esto es solo para Facebook.
//
// Corre en GitHub Actions (tiene META_ACCESS_TOKEN + META_PAGE_ID).

import { readFile } from "node:fs/promises";
import { getPageToken, graph, GRAPH } from "./lib/graph.mjs";

const POSTS = [
  { id: "1281288388394495_122100864135418511", captionFile: "content/published/single-20260802T133032Z/caption.txt" },
  { id: "1281288388394495_122100937797418511", captionFile: "content/published/carousel-20260802T192048Z/caption.txt" },
  { id: "1281288388394495_122100938391418511", captionFile: "content/published/single-20260802T180648Z/caption.txt" },
];

async function main() {
  const pageId = process.env.META_PAGE_ID;
  const token = process.env.META_ACCESS_TOKEN;
  const pageToken = await getPageToken(pageId, token);

  for (const post of POSTS) {
    const message = await readFile(post.captionFile, "utf8");
    console.log(`Actualizando ${post.id}...`);
    const out = await graph(`${GRAPH}/${post.id}`, { message, access_token: pageToken });
    console.log("  ok:", JSON.stringify(out));
  }
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
