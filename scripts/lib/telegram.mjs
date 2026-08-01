// Helpers para el bot de Telegram usado en el flujo de aprobación de posts.
//
// Env requerido:
//   TELEGRAM_BOT_TOKEN   token del bot (BotFather)
//   TELEGRAM_CHAT_ID     id del grupo/chat donde se manda la aprobación (negativo si es grupo)

const API = (token) => `https://api.telegram.org/bot${token}`;

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

async function call(token, method, params) {
  const res = await fetch(`${API(token)}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`Telegram ${method} falló: ${JSON.stringify(json)}`);
  }
  return json.result;
}

// Teclado inline estándar de aprobación para un item de queue con id `id`.
export function approvalKeyboard(id) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Aprobar", callback_data: `approve:${id}` },
        { text: "❌ Rechazar", callback_data: `reject:${id}` },
      ],
    ],
  };
}

export async function sendMessage(text, { replyMarkup } = {}) {
  const token = need("TELEGRAM_BOT_TOKEN");
  const chatId = need("TELEGRAM_CHAT_ID");
  return call(token, "sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup,
  });
}

export async function sendPhoto(photoUrl, caption, { replyMarkup } = {}) {
  const token = need("TELEGRAM_BOT_TOKEN");
  const chatId = need("TELEGRAM_CHAT_ID");
  return call(token, "sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    reply_markup: replyMarkup,
  });
}

export async function sendVideo(videoUrl, caption, { replyMarkup } = {}) {
  const token = need("TELEGRAM_BOT_TOKEN");
  const chatId = need("TELEGRAM_CHAT_ID");
  return call(token, "sendVideo", {
    chat_id: chatId,
    video: videoUrl,
    caption,
    reply_markup: replyMarkup,
  });
}

// Preview de carrusel: Telegram no permite botones en un media group, así que
// se manda el álbum de fotos y luego un mensaje aparte con caption + botones.
export async function sendCarouselPreview(imageUrls, caption, { replyMarkup } = {}) {
  const token = need("TELEGRAM_BOT_TOKEN");
  const chatId = need("TELEGRAM_CHAT_ID");
  const media = imageUrls.map((url, i) => ({
    type: "photo",
    media: url,
    ...(i === 0 ? { caption } : {}),
  }));
  await call(token, "sendMediaGroup", { chat_id: chatId, media });
  return call(token, "sendMessage", {
    chat_id: chatId,
    text: "👆 Preview del carrusel. ¿Aprobar?",
    reply_markup: replyMarkup,
  });
}

export async function getUpdates(offset) {
  const token = need("TELEGRAM_BOT_TOKEN");
  const res = await fetch(
    `${API(token)}/getUpdates${offset != null ? `?offset=${offset}&timeout=0` : "?timeout=0"}`
  );
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram getUpdates falló: ${JSON.stringify(json)}`);
  return json.result;
}

export async function answerCallbackQuery(callbackQueryId, text) {
  const token = need("TELEGRAM_BOT_TOKEN");
  return call(token, "answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

// Busca en las updates un callback_query "approve:<id>" o "reject:<id>" para el
// id dado. Devuelve { decision: "approve"|"reject", callbackQueryId } o null si
// no hay respuesta todavía.
export function findDecision(updates, id) {
  for (const u of updates) {
    const cb = u.callback_query;
    if (!cb || !cb.data) continue;
    if (cb.data === `approve:${id}`) return { decision: "approve", callbackQueryId: cb.id };
    if (cb.data === `reject:${id}`) return { decision: "reject", callbackQueryId: cb.id };
  }
  return null;
}
