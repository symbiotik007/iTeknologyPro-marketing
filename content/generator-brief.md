# Brief para el agente generador de contenido — iTeknology

Este archivo lo lee el agente Claude programado (2x/día) antes de generar un post
nuevo. Objetivo: decidir ángulo/tipo y escribir copy + prompts de imagen en
`content/pending-draft.json` (solo texto, sin generar imágenes ni llamar MCP
de imagen — eso lo hace GitHub Actions después, ver abajo), sin intervención
humana salvo la aprobación/rechazo por Telegram.

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

## Diseño: Gemini vía GitHub Actions (no en el routine cloud)

El routine cloud (Anthropic CCR) NO genera imágenes — no tiene forma segura de
recibir `GEMINI_SESSION_STATE` (equivale a un login completo de Google, no se
expone en texto plano en la config de un routine). En su lugar:

1. El routine cloud solo **decide el ángulo/tipo y escribe copy + prompts de
   imagen** (texto, nada de MCP ni generación real).
2. Guarda eso en `content/pending-draft.json`:
   ```json
   { "type": "single|carousel|reel", "targets": ["fb","ig"], "caption": "...",
     "prompts": ["prompt imagen 1", "prompt imagen 2", ...] }
   ```
   (1 prompt para single, 5 para carousel/reel — usa el prompt de referencia
   de la sección de abajo como base, variando el feature/ángulo).
3. Hace `git add content/pending-draft.json && git commit && git push` — SOLO
   eso, nada de MCP ni tokens.
4. Ese push dispara `.github/workflows/generate-queue.yml`, que corre en
   GitHub Actions (tiene `GEMINI_SESSION_STATE` como Secret real, cifrado):
   genera las imágenes con Gemini headless (`scripts/generate-cloud.mjs`),
   arma el item de queue (`scripts/generate-content.mjs`), notifica Telegram,
   y borra el draft procesado. Todo esto ya sin que el routine cloud toque
   ningún secreto.

Ni HighsField ni Canva se usan en este flujo — Gemini es gratis/ilimitado y
es el método principal.

## Prompt de imagen (referencia, layout "Feature Highlight" ya validado)

Usar esto como base para los `prompts` del draft, variando el feature/ángulo:

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

`content/prompts-vault.md` tiene más ejemplos ya validados (ángulo e-commerce
genérico) — reusar ese estilo/formato para escribir prompts nuevos.

## Manejo de fallas (obligatorio, no lo saltes)

- El routine cloud **solo escribe texto** (`content/pending-draft.json`) y
  pushea — no debería fallar casi nunca. Si el push falla, reintentar UNA vez;
  si vuelve a fallar, avisar por Telegram y terminar sin insistir más.
- La generación real (Gemini, en GitHub Actions vía `generate-queue.yml`) ya
  tiene su propio manejo: si la sesión de Gemini caducó (`generate-cloud.mjs`
  sale con exit code 2), el workflow debe fallar visiblemente en Actions y
  quien lo note debe re-exportar la sesión (`npm run chrome` +
  `node scripts/export-gemini-session.mjs` + `gh secret set
  GEMINI_SESSION_STATE`). No hay fallback automático a HighsField/Canva en
  este flujo — si Gemini falla, ese post simplemente no se genera esa corrida
  (mejor eso que publicar algo a medias); `publish-queue.mjs` ya cae solo a la
  rotación vieja si la queue queda vacía.

## Qué NO hacer

- No repetir el mismo ángulo/tipo dos corridas seguidas.
- No inventar cifras/testimonios como si fueran reales sin dejarlo claro que son
  ilustrativos.
- No generar imágenes ni llamar ninguna MCP tool de imagen desde el routine
  cloud — solo escribe `content/pending-draft.json` y pushea. La generación
  real la hace GitHub Actions (`generate-queue.yml`), no el routine.
