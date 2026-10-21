# Vorágine by Alttura · Catálogo 3D de fragancias

Vitrina web interactiva de **Vorágine by Alttura**: más de 760 fragancias de diseñador, nicho y perfumería árabe presentadas en una órbita 3D. El cliente gira la vitrina, abre la pirámide olfativa de cada perfume, arma su pedido y lo cotiza directamente por WhatsApp.

**Sitio en línea:** https://juamm-se.github.io/voragine-web/

## Qué puede hacer el cliente

- **Explorar la vitrina 3D** deslizando o con las flechas.
- **Encontrar su perfume** con una guía de dos pasos (para quién y qué familia olfativa).
- **Buscar** por nombre, marca o nota.
- **Filtrar** por público, línea (diseñador, nicho, árabe) y familia olfativa.
- **Ver la pirámide olfativa** (notas de salida, corazón y fondo).
- **Armar un pedido** con varios perfumes y cotizarlo en un solo mensaje de WhatsApp.
- **Volver al inicio** desde cualquier pantalla.

## Estructura

| Ruta | Contenido |
|---|---|
| `index.html` | La página |
| `config.js` | Nombre de la tienda, eslogan, número de WhatsApp y mensajes de cotización |
| `data/catalogo.js` | El catálogo de perfumes |
| `css/estilos.css` | Diseño |
| `js/app.js` | Motor de la vitrina 3D (archivo compilado, no editar a mano) |
| `img/` | Logos e íconos |
| `img/perfumes/` | Foto de cada perfume: `.webp` para internet y `.js` para abrir la página con doble clic sin servidor |

## Cómo hacer cambios

1. **Datos de la tienda:** editar los valores entre comillas en `config.js`.
2. **Catálogo:** reemplazar `data/catalogo.js` con el archivo generado por la herramienta interna de Excel.
3. **Fotos:** agregar `PERF-xxx.webp` y `PERF-xxx.js` en `img/perfumes/` y poner `"Imagen": "img/perfumes/PERF-xxx.webp"` en el perfume dentro del catálogo.

Para ver la página en el computador basta con abrir `index.html` con doble clic.

## Versiones

- `main` es lo que está publicado. Todo lo que entra a `main` se publica solo en GitHub Pages.
- Los cambios se hacen en una rama aparte y entran a `main` con un pull request.
- Cada entrega importante lleva una etiqueta de versión (`v1.0.0`, `v1.1.0`, …). El historial está en [CHANGELOG.md](CHANGELOG.md).

## Aviso legal

© 2026 Vorágine by Alttura. Todos los derechos reservados.

El código, el diseño y los textos de este repositorio son propiedad de Vorágine by Alttura. Que el repositorio sea visible no da permiso para copiarlo, usarlo ni modificarlo. Ver [LICENSE](LICENSE).

Las marcas y nombres de perfumes pertenecen a sus respectivos dueños y se mencionan solo para identificar los productos.
