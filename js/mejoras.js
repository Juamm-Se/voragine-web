/* ============================================================
   Mejoras de calidad (octubre 2026)
   Va entre data/catalogo.js y js/app.js. Para deshacer, quita su <script> del index.html.
   ============================================================ */
(function () {
  // 1. Los perfumes con foto van primero; los que aún no tienen foto quedan al final.
  if (Array.isArray(window.CATALOGO)) {
    window.CATALOGO.sort(function (a, b) { return (a.Imagen ? 0 : 1) - (b.Imagen ? 0 : 1); });
  }

  var $ = function (s) { return document.querySelector(s); };

  // 2. "767 referencias" del panel de filtros muestra cuántos perfumes hay con los filtros puestos.
  var pos = $('#info-pos'), total = $('#total-catalogo');
  if (pos && total) {
    new MutationObserver(function () {
      var m = pos.textContent.match(/\/\s*(\d+)/);
      if (m && total.textContent !== m[1]) total.textContent = m[1];
    }).observe(pos, { childList: true, characterData: true, subtree: true });
  }

  // 3. En celular, tocar fuera del panel de filtros lo cierra.
  //    Ese toque solo cierra el panel, para no activar sin querer lo que había debajo.
  document.addEventListener('click', function (e) {
    if (!document.body.classList.contains('filtros-abiertos') || window.innerWidth > 1100) return;
    if (e.target.closest('#filtros, .barra')) return;
    e.preventDefault();
    e.stopPropagation();
    var b = $('#btn-filtros');
    if (b) b.click();
  }, true);

  // 4. Accesibilidad: el mensaje "No encontramos..." del buscador es una opción deshabilitada de la lista.
  var sug = $('#sugerencias');
  if (sug) {
    new MutationObserver(function () {
      sug.querySelectorAll('li:not([role])').forEach(function (li) {
        li.setAttribute('role', 'option');
        li.setAttribute('aria-disabled', 'true');
      });
    }).observe(sug, { childList: true });
  }

  // 5. Accesibilidad: la portada le da nombre a la ventana de bienvenida.
  var h1 = document.querySelector('.portada-titulo'), guia = $('#guia');
  if (h1 && guia) {
    h1.id = h1.id || 'portada-titulo';
    guia.setAttribute('aria-labelledby', 'portada-titulo guia-titulo');
  }
})();
