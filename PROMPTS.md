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
