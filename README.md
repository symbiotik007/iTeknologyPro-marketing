# iTeknologyPro — Marketing automático (IG + FB)

Publica automáticamente un post al día en **Instagram y Facebook** con el branding de
iTeknology, para motivar a la gente a crear su tienda. Corre gratis en **GitHub Actions**
(no necesitas servidor). Las imágenes las haces tú (ver `PROMPTS.md`); el texto ("copy")
lo genera Claude por lotes y se guarda en `content/copy.json`.

## Cómo funciona

```
GitHub Actions (cron diario, gratis)
  -> scripts/post.mjs
       elige la siguiente imagen de content/images/  (rotación)
       elige el siguiente copy de content/copy.json   (rotación)
       imagen se sirve por URL pública raw de GitHub (gratis)
       publica en Facebook (página) y en Instagram (Graph API de Meta)
       guarda el avance en content/state.json
```

Un post por corrida. La rotación no se repite hasta agotar imágenes/copys.

---

## Puesta en marcha (una sola vez)

### 1. Subir este repo a GitHub

Crea un repo (privado está bien) llamado `iTeknologyPro-marketing` y sube esta carpeta.

### 2. Conseguir los datos de Meta

Ya tienes cuenta en Meta for Developers. Necesitas 3 valores:

| Secret | Qué es | Dónde sacarlo |
|--------|--------|---------------|
| `META_PAGE_ID` | ID de la página de Facebook | En la página → *Información*, o Graph API Explorer: `GET /me/accounts` |
| `META_IG_USER_ID` | ID de la cuenta de Instagram **Business** | `GET /{PAGE_ID}?fields=instagram_business_account` |
| `META_ACCESS_TOKEN` | **Page Access Token de larga duración** | Ver abajo |

**Requisitos previos:**
- La cuenta de Instagram debe ser **Business** o **Creator** (no personal) y estar
  **vinculada a la página de Facebook**.
- La app de Meta necesita los permisos: `pages_show_list`, `pages_read_engagement`,
  `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`.

**Sacar el Page Access Token de larga duración:**
1. En [Graph API Explorer](https://developers.facebook.com/tools/explorer/) elige tu app,
   genera un *User Token* con los permisos de arriba.
2. Cámbialo por uno de larga duración (60 días):
   ```
   GET /oauth/access_token?grant_type=fb_exchange_token
       &client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=USER_TOKEN
   ```
3. Con ese token largo, pide los tokens de página (estos **no expiran**):
   ```
   GET /me/accounts
   ```
   El campo `access_token` de tu página es tu `META_ACCESS_TOKEN`.

> Los Page Tokens obtenidos desde un User Token de larga duración no caducan mientras la
> contraseña/permisos no cambien. Si algún día deja de publicar, regenera el token.

### 3. Guardar los secrets en GitHub

Repo → **Settings → Secrets and variables → Actions → New repository secret**. Crea:
`META_PAGE_ID`, `META_IG_USER_ID`, `META_ACCESS_TOKEN`.

> Nunca pongas los tokens en el código ni en el chat. Solo como Secrets.

### 4. Agregar imágenes

Genera imágenes con los prompts de `PROMPTS.md`, guárdalas en `content/images/` como
`01.png`, `02.png`… y haz push. Con al menos 5 imágenes ya arrancas.

### 5. Probar

- **Manual:** repo → pestaña **Actions** → *Publicar en redes* → **Run workflow**.
- **Local (sin publicar):** crea `.env` desde `.env.example` y corre:
  ```bash
  npm run post:dry     # muestra qué publicaría, sin publicar
  npm run post         # publica de verdad (necesita RAW_BASE o estar en Actions)
  ```

Listo. A partir de ahí publica solo, todos los días a las 9:00 a.m. Colombia.

---

## Tareas comunes

- **Cambiar la hora:** edita el `cron` en `.github/workflows/post.yml` (está en UTC).
- **Publicar más/menos seguido:** agrega o quita líneas `cron`.
- **Desactivar una red temporalmente:** pon `TARGETS: fb` (o `ig`) en el `env` del workflow.
- **Más copy:** pídele a Claude "genera más copy para iTeknology" y añade al array de
  `content/copy.json`.
- **Pausar todo:** desactiva el workflow en la pestaña Actions.

## Estructura

```
.github/workflows/post.yml           cron viejo (rotación simple, ahora solo manual)
.github/workflows/publish-queue.yml  cron 2x/día: publica lo aprobado en content/queue/
scripts/lib/graph.mjs                Graph API compartida (imagen, carrusel, reel)
scripts/lib/telegram.mjs             bot de aprobación (botones Aprobar/Rechazar)
scripts/lib/video.mjs                arma el reel (slideshow ffmpeg) desde N imágenes
scripts/post.mjs                     publicación simple (rotación vieja, fallback)
scripts/generate-content.mjs         arma un item de queue + notifica por Telegram
scripts/publish-queue.mjs            revisa aprobación y publica (single/carrusel/reel)
content/copy.json                    banco de textos viejo (rota uno por día, fallback)
content/images/                      imágenes viejas (rotación, fallback)
content/state.json                   índice de rotación del fallback
content/queue/<id>/                  posts generados esperando aprobación/publicación
  meta.json                            { id, type: "single"|"carousel"|"reel", targets, status }
  caption.txt                          texto del post
  assets/                              imágenes (.jpg) o video.mp4 (si type=reel)
content/published/<id>/              histórico de lo ya publicado (se mueve desde queue/)
content/generator-brief.md           brief de marca/ángulos para el agente generador
                                      (diseño vía Gemini/generate.mjs, no Canva —
                                      Canva Brand Template requiere plan pago)
PROMPTS.md                           prompts para generar las imágenes
.env.example                         plantilla para pruebas locales
```

## Después (cuando haya presupuesto / tiempo)

- Agregar **TikTok** y **LinkedIn** (requieren revisión de app, tarda).
- Agregar **Threads** (Graph API, similar a IG).
- Métricas: leer likes/alcance vía Graph API y guardarlos.
