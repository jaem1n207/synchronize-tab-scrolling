---
Cómo usarlo

1. Haz clic en el icono de la extensión.
2. Selecciona las pestañas que quieres sincronizar en la lista de pestañas abiertas.
3. Si tienes muchas pestañas, encuéntralas rápido por título, parte de la URL o dominio.
4. Haz clic en "Iniciar sincronización" y luego desplázate en cualquier pestaña conectada.
---

Sincronización básica de scroll

Cuando haces scroll en una pestaña, las otras pestañas conectadas se mueven a la misma posición relativa según la longitud de cada página.

Por ejemplo, si vas al punto del 40 % de un documento, el otro documento también se coloca en su propio punto del 40 %. Aunque las páginas tengan longitudes distintas, avanzan juntas según el flujo general, lo que facilita leer documentos largos en paralelo.

Incluso en páginas con smooth scrolling activado, el scroll sincronizado aplica la posición más reciente de inmediato.

---

Ajuste manual de posición

Cuando la estructura de las páginas es distinta, la misma posición relativa puede no coincidir con el mismo párrafo.

Una traducción puede ser más larga o más corta que el original. Staging y Production pueden tener banners o interfaces experimentales distintas. Cada documento también puede tener índices, anuncios o alturas de encabezado diferentes.

En ese caso, mantén pulsado Option (Mac) o Alt (Windows/Linux) y desplaza solo una pestaña.

Mientras mantienes la tecla pulsada, solo se mueve la pestaña actual. Al soltarla, esa posición se guarda como nuevo punto de referencia y todas las pestañas vuelven a desplazarse juntas desde ahí.

Esto es útil cuando quieres reajustar la posición de comparación sin detener la sincronización.

---

URL Sync

Activa URL Sync para sincronizar también la navegación de páginas compatibles, además de la posición de scroll.

Los cambios de ruta(path) se sincronizan, por ejemplo al pasar de `/products/keyboard` a `/products/mouse`. Los parámetros de consulta, como términos de búsqueda, filtros y ordenación, también se aplican juntos. Las rutas de idioma como `/ko` y `/en` se mantienen por pestaña cuando es posible.

URL Sync ofrece dos modos.

1. Seguir la pestaña modificada

Las otras pestañas siguen el sitio web y el flujo de página de la pestaña modificada. La ruta y los parámetros de consulta cambian juntos, mientras que las rutas de idioma como `/en` o `/ko` se mantienen en la pestaña de destino cuando es posible.

Estado inicial:

• Pestaña A: https://docs.example.com/ko/guides/start?q=scroll&filter=basic
• Pestaña B: https://docs.example.com/en/guides/start?q=scroll&filter=basic

La pestaña A va a otra ruta y condición de búsqueda:

• Pestaña A: https://docs.example.com/ko/guides/url-sync?q=tab-sync&filter=advanced

Resultado:

• Pestaña A: https://docs.example.com/ko/guides/url-sync?q=tab-sync&filter=advanced
• Pestaña B: https://docs.example.com/en/guides/url-sync?q=tab-sync&filter=advanced

Este modo es útil para comparar documentos, resultados de búsqueda interna o listas filtradas del mismo sitio en varios idiomas.

2. Mantener el sitio web de cada pestaña

Cada pestaña permanece en su propio sitio web y, cuando es posible, se mueve a la misma ruta y los mismos parámetros de consulta. Las rutas de idioma también se mantienen por pestaña.

Estado inicial:

• Pestaña A: https://www.example.com/ko/products/keyboard?q=keyboard&color=black
• Pestaña B: https://staging.example.com/en/products/keyboard?q=keyboard&color=black

La pestaña A va a otra ruta de producto y filtro:

• Pestaña A: https://www.example.com/ko/products/mouse?q=mouse&color=white

Resultado:

• Pestaña A: https://www.example.com/ko/products/mouse?q=mouse&color=white
• Pestaña B: https://staging.example.com/en/products/mouse?q=mouse&color=white

Este modo es útil para comparar páginas con estructuras de URL similares en sitios diferentes. Puedes revisar en paralelo Production y Staging, A/B variants, sitios por país, páginas por idioma, resultados de búsqueda interna y listas de productos filtradas.

URL Sync puede no aplicarse en páginas bloqueadas por políticas de seguridad del navegador o restricciones del sitio. Por ejemplo, algunas páginas de resultados de motores de búsqueda, páginas de inicio de sesión, visores de PDF y páginas de aplicaciones web se excluyen de la sincronización.

---

Funciones principales

• Sincronización manual de páginas locales file:// que el navegador puede renderizar directamente, como HTML, Markdown, JSON, texto, CSV y logs
• Sincronización en tiempo real de la posición de scroll entre varias pestañas
• URL Sync para sincronizar también la navegación de páginas compatibles
• Modos para seguir el mismo sitio web o mantener cada pestaña en su propio sitio web
• Compatibilidad con sincronización de rutas(path), términos de búsqueda, filtros, ordenación y otros parámetros de consulta
• Ajusta una sola pestaña con Option/Alt y continúa sincronizando desde la posición ajustada
• Comparación de Staging/Production, A/B variants, original/traducción y páginas multilingües
• Sugerencias automáticas de sincronización cuando se detectan páginas idénticas o relacionadas
• Compatible con Chrome, Firefox, Edge, Brave y navegadores basados en Chromium
• Funciona localmente, sin recopilación de datos, analíticas, rastreo ni registro de cuenta

---

Páginas no compatibles

Debido a políticas de seguridad del navegador o restricciones del sitio, esta extensión no puede usarse en las siguientes páginas.

• Servicios de Google: Docs, Drive, Gmail, Sheets, Slides
• Aplicaciones web como Figma, JIRA, Notion y Microsoft Office Online
• Páginas internas del navegador: chrome://, edge://, about:
• Tiendas de extensiones y algunas páginas de resultados de motores de búsqueda
• Archivos PDF y visores de PDF
• Páginas de inicio de sesión y autenticación
• URL especiales como view-source:, data: y blob:

Las pestañas no compatibles aparecen desactivadas en la lista de selección, y el motivo se muestra en una descripción emergente.

---

Privacidad

• No recopila datos del usuario
• Sin analíticas, rastreo ni cookies
• Funciona sin conexión, sin solicitudes de red
• No requiere cuenta ni inicio de sesión
• No lee ni sube el contenido de archivos locales
• Código abierto: https://github.com/jaem1n207/synchronize-tab-scrolling

---

Disponible en Chrome, Firefox, Edge, Brave y navegadores basados en Chromium.

9 idiomas disponibles: Español, English, 한국어, 日本語, Français, Deutsch, 中文(简体), 中文(繁體), हिन्दी.
