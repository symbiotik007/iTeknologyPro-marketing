// Helpers compartidos para la Graph API de Meta (Facebook + Instagram).
// Usado por scripts/post.mjs, scripts/post-pending.mjs y scripts/publish-queue.mjs.

export const GRAPH = "https://graph.facebook.com/v21.0";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function graph(url, params) {
  const body = new URLSearchParams(params);
  const res = await fetch(url, { method: "POST", body });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Graph API ${res.status}: ${JSON.stringify(json.error || json)}`);
  }
  return json;
}

export async function graphGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH}/${path}${qs ? `?${qs}` : ""}`);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Graph API ${res.status}: ${JSON.stringify(json.error || json)}`);
  }
  return json;
}

// Publicar en una Página de Facebook exige un Page Access Token, no el token de
// usuario/system-user. Lo derivamos en runtime desde META_ACCESS_TOKEN.
export async function getPageToken(pageId, token) {
  const json = await graphGet(`${pageId}`, { fields: "access_token", access_token: token });
  if (!json.access_token) {
    throw new Error(`No pude obtener el Page Access Token: ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

// Espera a que un contenedor de IG termine de procesarse (status_code=FINISHED).
// tries/gapMs configurables porque video (reel) tarda mucho más que imagen.
export async function waitContainerReady(creationId, token, { tries = 20, gapMs = 3000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const json = await graphGet(`${creationId}`, { fields: "status_code", access_token: token });
    if (json.status_code === "FINISHED") return;
    if (json.status_code === "ERROR") throw new Error("IG: el contenedor falló al procesarse");
    await sleep(gapMs);
  }
  throw new Error("IG: el contenedor no quedó listo a tiempo");
}

// ── Facebook ─────────────────────────────────────────────────────────────

export async function postFacebookPhoto(pageId, token, imageUrl, message) {
  const out = await graph(`${GRAPH}/${pageId}/photos`, {
    url: imageUrl,
    message,
    access_token: token,
  });
  return out.post_id || out.id;
}

export async function postFacebookVideo(pageId, token, videoUrl, description) {
  const out = await graph(`${GRAPH}/${pageId}/videos`, {
    file_url: videoUrl,
    description,
    access_token: token,
  });
  return out.id;
}

// Carrusel en FB: subir cada foto sin publicar (published=false) para obtener
// media_fbid, luego crear el post en /feed adjuntando esos media_fbid.
export async function postFacebookCarousel(pageId, token, imageUrls, message) {
  const mediaIds = [];
  for (const url of imageUrls) {
    const out = await graph(`${GRAPH}/${pageId}/photos`, {
      url,
      published: "false",
      access_token: token,
    });
    mediaIds.push(out.id);
  }
  const attached_media = JSON.stringify(mediaIds.map((id) => ({ media_fbid: id })));
  const out = await graph(`${GRAPH}/${pageId}/feed`, {
    message,
    attached_media,
    access_token: token,
  });
  return out.id;
}

// ── Instagram ────────────────────────────────────────────────────────────

export async function postInstagramImage(igUserId, token, imageUrl, caption) {
  const container = await graph(`${GRAPH}/${igUserId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: token,
  });
  await waitContainerReady(container.id, token);
  const publish = await graph(`${GRAPH}/${igUserId}/media_publish`, {
    creation_id: container.id,
    access_token: token,
  });
  return publish.id;
}

export async function postInstagramCarousel(igUserId, token, imageUrls, caption) {
  const childIds = [];
  for (const url of imageUrls) {
    const child = await graph(`${GRAPH}/${igUserId}/media`, {
      image_url: url,
      is_carousel_item: "true",
      access_token: token,
    });
    childIds.push(child.id);
  }
  const parent = await graph(`${GRAPH}/${igUserId}/media`, {
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption,
    access_token: token,
  });
  await waitContainerReady(parent.id, token);
  const publish = await graph(`${GRAPH}/${igUserId}/media_publish`, {
    creation_id: parent.id,
    access_token: token,
  });
  return publish.id;
}

// Reel: el contenedor de video tarda mucho más que uno de imagen en procesarse.
export async function postInstagramReel(igUserId, token, videoUrl, caption) {
  const container = await graph(`${GRAPH}/${igUserId}/media`, {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    access_token: token,
  });
  await waitContainerReady(container.id, token, { tries: 60, gapMs: 5000 }); // hasta 5 min
  const publish = await graph(`${GRAPH}/${igUserId}/media_publish`, {
    creation_id: container.id,
    access_token: token,
  });
  return publish.id;
}
