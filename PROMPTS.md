# Prompts para generar las imágenes (Gemini / nano-banana / ChatGPT)

Genera imágenes **cuadradas 1080x1080** (formato IG/FB feed). Marca iTeknology:

- **Color principal:** azul `#2563eb`
- **Fondo:** blanco o azul `#2563eb`, limpio y moderno
- **Logo:** pega el logo de iTeknology arriba o abajo (súbelo tú al generador o añádelo después)
- **Texto corto y grande**, legible en móvil
- Estilo: tech, minimalista, profesional, amigable

Guarda cada imagen en `content/images/` con nombre numerado: `01.png`, `02.png`, `03.png`…
El script las rota en orden alfabético.

> Requisito Meta: las imágenes deben ser **JPG o PNG**, cuadradas o verticales, y pesar < 8 MB.

---

## Prompt base (copia y ajusta el texto de cada tarjeta)

```
Diseño de post para redes sociales, formato cuadrado 1080x1080.
Marca de tecnología moderna llamada "iTeknology". Paleta: azul #2563eb y blanco.
Estilo minimalista, limpio, profesional, con formas geométricas suaves.
Texto grande y legible: "AQUÍ_EL_TITULAR".
Deja espacio en la parte inferior para un logo y un botón que diga "Crea tu tienda gratis".
Sin marcas de agua, alta calidad, listo para Instagram.
```

## Titulares sugeridos (uno por imagen)

1. `Tu tienda online en minutos`
2. `Vende 24/7 sin complicarte`
3. `De WhatsApp a tienda profesional`
4. `Sin código. Sin límites.`
5. `Restaurante, tienda o delivery`
6. `Cientos de negocios ya venden aquí`
7. `Tu marca. Tu tienda. Tus reglas.`
8. `Empieza gratis hoy`
9. `Controla pedidos y repartidores`
10. `El mejor momento es HOY`

## Recomendación de pareja imagen ↔ copy

No es obligatorio que coincidan 1:1 (el script rota ambos por separado), pero si
generas los titulares en el mismo orden que `content/copy.json`, quedan alineados.
Mantén un banco parejo: si hay 15 copys, ten ~15 imágenes.

---

## 5 prompts listos para copy & paste

Pégalos tal cual en Gemini / nano-banana / ChatGPT. Guarda cada resultado como
`01.png`, `02.png`, `03.png`, `04.png`, `05.png` en `content/images/`.

### 01 — Tu tienda en minutos

```
Post cuadrado 1080x1080 para Instagram y Facebook de una marca de tecnología llamada "iTeknology".
Paleta: azul #2563eb y blanco. Estilo minimalista, moderno, limpio, con formas geométricas suaves y un mockup sutil de una tienda online en un smartphone.
Titular grande y legible en el centro: "TU TIENDA ONLINE EN MINUTOS".
Debajo, texto pequeño: "Sin código. Empieza gratis."
Deja espacio limpio en la parte inferior para el logo y un botón azul que diga "Crea tu tienda gratis".
Alta calidad, sin marcas de agua, tipografía sans-serif nítida.
```

### 02 — Vende 24/7

```
Post cuadrado 1080x1080 para redes sociales, marca "iTeknology". Paleta azul #2563eb y blanco.
Estilo minimalista y profesional, con un ícono grande de reloj o carrito de compras y elementos tech ligeros.
Titular destacado: "VENDE 24/7 SIN COMPLICARTE".
Texto de apoyo pequeño: "Tus clientes compran a cualquier hora."
Zona inferior libre para logo y botón azul "Crea tu tienda gratis".
Alta calidad, sin marcas de agua, tipografía sans-serif grande y legible en móvil.
```

### 03 — De WhatsApp a tienda profesional

```
Post cuadrado 1080x1080 para Instagram, marca de tecnología "iTeknology". Colores azul #2563eb y blanco.
Concepto antes/después: a la izquierda un chat de WhatsApp simple, a la derecha una tienda online profesional en un teléfono. Flecha entre ambos.
Titular: "DE WHATSAPP A TIENDA PROFESIONAL".
Estilo limpio, minimalista, moderno. Espacio inferior para logo y botón azul "Crea tu tienda gratis".
Alta calidad, sin marcas de agua, tipografía nítida.
```

### 04 — Restaurante, tienda o delivery

```
Post cuadrado 1080x1080 para redes, marca "iTeknology". Paleta azul #2563eb y blanco.
Muestra 3 íconos claros en fila: una hamburguesa (restaurante), una bolsa de compras (tienda) y una moto de delivery.
Titular arriba: "RESTAURANTE, TIENDA O DELIVERY".
Subtítulo: "Todo en una sola plataforma."
Estilo minimalista, geométrico, moderno. Zona inferior para logo y botón azul "Crea tu tienda gratis".
Alta calidad, sin marcas de agua, tipografía sans-serif legible.
```

### 05 — Empieza gratis hoy

```
Post cuadrado 1080x1080 motivacional para Instagram y Facebook, marca de tecnología "iTeknology".
Fondo azul #2563eb con detalles geométricos blancos, o blanco con acentos azules. Look premium y limpio.
Titular grande y centrado: "EMPIEZA GRATIS HOY".
Subtítulo pequeño: "El mejor momento para tu negocio es ahora."
Deja espacio para logo y un botón blanco o azul que diga "Crea tu tienda gratis".
Alta calidad, sin marcas de agua, tipografía sans-serif audaz y legible.
```
