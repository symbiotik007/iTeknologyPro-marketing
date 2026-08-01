# Brief para el agente generador de contenido — iTeknology

Este archivo lo lee el agente Claude programado (2x/día) antes de generar un post
nuevo. Objetivo: producir copy + diseño listos para `scripts/generate-content.mjs`,
sin intervención humana salvo la aprobación/rechazo por Telegram.

## Marca

- **iTeknology**: plataforma de tienda online / e-commerce sin código (ver
  `content/prompts-vault.md` para el ángulo genérico) y soluciones tech para
  restaurantes, bares y supermercados (ver ángulo food-service abajo).
- Paleta: azul **#2563eb** + blanco. Minimalista, premium, tech-forward. Sin emojis
  en las imágenes (sí se pueden usar en el copy/caption). Logo iTeknology siempre visible.
- CTA constante: botón azul con texto corto ("Crea tu tienda gratis", "Agenda tu Demo",
  según el ángulo) + logo abajo.
- Tono: autoritativo pero empático con el dueño de negocio, moderno, orientado a
  solución — nunca alarmista ni genérico de "marketing de agencia".

## Ángulos de contenido (rotar, no repetir el mismo 2 veces seguidas)

1. **E-commerce genérico** (tienda online sin código) — usa `content/prompts-vault.md`
   como banco de ideas visuales/copy ya validado.
2. **Food-service vertical** (restaurantes/bares/supermercados/delivery) — dolor:
   comisiones de apps de delivery, caos operativo, cero datos del cliente. Solución:
   app propia + dispatching inteligente + pedidos unificados (POS/web/app). Ver
   ejemplos de copy ya escritos en esta conversación (carrusel "Problema/Solución").
3. **Feature highlight** — una funcionalidad puntual explicada en un solo post
   (ej. "Smart Dispatching", "Catálogo con IA", "Checkout en 1 clic").
4. **Prueba social / mini caso** — cifra o cita de un cliente (usar datos reales si
   existen; si no, usar un ejemplo genérico plausible y aclararlo internamente como
   ilustrativo, nunca inventar una cita atribuida a un cliente real inexistente).

## Formato por corrida (rotar tipo)

- **single**: 1 imagen, feature highlight o gancho corto. Layout: logo arriba,
  mockup/ícono centro, headline + subtítulo, CTA abajo.
- **carousel**: 5 slides formato "Problema → Solución → Prueba social → CTA"
  (ver guía de layout ya definida: slide 1 hook oscuro, slides 2-3 problema/solución,
  slide 4 mini caso, slide 5 CTA).
- **reel**: mismas 5 slides de un carrusel, pasadas a `buildSlideshow()` — no se
  escribe copy distinto, se reusa el mismo carrusel como slideshow animado.

Sugerencia de rotación simple: mañana → single o carousel alternando; tarde →
el que no se usó en la mañana, con un reel cada 3-4 días en vez de un carousel.

## Diseño en el routine cloud programado: HighsField primero

El routine cloud (Anthropic CCR) no tiene forma segura de recibir
`GEMINI_SESSION_STATE` (equivale a un login completo de Google — no se expone
en texto plano en la config de un routine). Para las corridas automáticas
2x/día, usar **la herramienta MCP `HighsField generate_image`** (conector ya
enlazado al routine, sin secreto en texto plano) como método principal de
diseño, con `use_unlim: true` si hay cupo gratis disponible.

`scripts/generate-cloud.mjs` (Gemini headless) queda disponible para uso
manual/local o para una futura corrida que sí tenga un canal seguro de
secretos — no lo uses en el routine cloud actual.

## Diseño (Gemini, no Canva) — referencia para uso local/manual

Canva Brand Template requiere plan pago (Pro/Teams/Enterprise) que la cuenta
conectada no tiene — `publish-brand-template` falla con
`"This feature requires a Canva paid plan"`. Se descarta Canva para este
pipeline; se usa el mismo flujo que ya existía en el repo antes de esta
automatización:

- **Prompts de imagen** salen de `content/prompts-vault.md` (banco existente,
  ángulo e-commerce genérico) — para el ángulo food-service, escribir el prompt
  siguiendo el mismo formato/reglas de estilo del vault (ver ejemplo de
  referencia abajo) y agregarlo como nueva entrada del vault.
- **Generación real**: `scripts/generate.mjs` (Playwright + CDP contra Chrome
  local del usuario, sesión de Gemini) — corre LOCAL, no en GitHub Actions. El
  agente programado no puede correr Gemini web por sí mismo (necesita el Chrome
  del usuario abierto); en su lugar, el agente arma el prompt de la corrida y
  se lo entrega al usuario (o usa `generate.mjs` si detecta que Chrome con
  debug port ya está corriendo — `npm run chrome` primero).
### Manejo de fallas (obligatorio, no lo saltes)

En el routine cloud, el diseño va directo por `HighsField generate_image`
(`use_unlim: true` si hay cupo gratis). Si falla o no hay cupo:

- Avisar por Telegram (`sendMessage` de `scripts/lib/telegram.mjs`) y NO
  generar contenido esa corrida (mejor saltarse un post que publicar algo a
  medias) — `publish-queue.mjs` ya cae solo a la rotación vieja de
  `content/images/` si la queue queda vacía.

(La ruta Gemini vía `generate-cloud.mjs` con detección de sesión caducada —
exit code 2 — sigue documentada más abajo para cuando se use local/manual.)

- Prompt de referencia (layout "Feature Highlight" ya validado):
  ```
  Post cuadrado 1080x1080 para Instagram/Facebook, marca "iTeknology". Fondo
  con degradado oscuro navy/negro en el 45% central, resto blanco limpio. Azul
  #2563eb + blanco, minimalista, premium, tech-forward, sin emojis. Tipografía
  sans-serif nítida (Poppins/Inter). Zona superior: wordmark "iTeknology" en
  blanco, esquina superior izquierda. Centro (bloque oscuro): mockup de
  dashboard/panel de pedidos en smartphone. Headline blanco bold 1 línea +
  subtítulo 1 línea más chico. Parte inferior (fondo blanco): botón pill azul
  con CTA. Composición llena todo el canvas, sin márgenes accidentales, sin
  texto cortado ni corrupto.
  ```
- Formato final: **1080x1080px JPG** (ya lo hace `toJpeg1080()` en
  `generate.mjs`).

## Proceso mecánico (después de tener copy + imágenes exportadas)

1. Descargar las imágenes exportadas de Canva a disco (ruta temporal).
2. Armar un `draft.json`:
   ```json
   { "type": "single|carousel|reel", "targets": ["fb","ig"], "caption": "...", "assets": ["ruta1.jpg", ...] }
   ```
3. Correr `node scripts/generate-content.mjs draft.json` — esto arma
   `content/queue/<id>/`, commitea+pushea, y notifica por Telegram con botones
   Aprobar/Rechazar.
4. No publicar nada directo — eso lo hace `scripts/publish-queue.mjs` en el
   siguiente checkpoint de GitHub Actions (9:30am / 7:00pm Colombia).

## Qué NO hacer

- No repetir el mismo ángulo/tipo dos corridas seguidas.
- No inventar cifras/testimonios como si fueran reales sin dejarlo claro que son
  ilustrativos.
- No saltarse el paso de Telegram — todo pasa por `generate-content.mjs`, nunca
  se llama a `graph.mjs` directo desde el agente generador.
