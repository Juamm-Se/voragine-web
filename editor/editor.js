/* Editor Vorágine: panel del equipo para editar el catálogo con Claude. */
(() => {
  "use strict";
  const CFG = window.EDITOR || {};
  const $ = (s) => document.querySelector(s);
  const LLAVE_SESION = "editor-voragine-sesion";

  // ---------- Utilidades ----------
  const guardarLocal = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const leerLocal = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (_) { return null; } };
  const el = (tag, attrs = {}, ...hijos) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else n.setAttribute(k, v);
    }
    for (const h of hijos.flat()) if (h != null) n.append(h);
    return n;
  };
  const mostrar = (id) => {
    for (const p of ["#pantalla-entrar", "#pantalla-config", "#pantalla-editor"]) $(p).hidden = p !== id;
  };

  // ---------- Sesión (Supabase Auth por REST) ----------
  let sesion = leerLocal(LLAVE_SESION);

  async function auth(tipo, cuerpo) {
    const r = await fetch(`${CFG.supabaseUrl}/auth/v1/token?grant_type=${tipo}`, {
      method: "POST",
      headers: { apikey: CFG.supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error_description || d.msg || "No se pudo iniciar sesión");
    sesion = { token: d.access_token, renovar: d.refresh_token, vence: Date.now() + (d.expires_in - 60) * 1000 };
    guardarLocal(LLAVE_SESION, sesion);
  }

  async function token() {
    if (!sesion) throw new Error("sin sesión");
    if (Date.now() > sesion.vence) await auth("refresh_token", { refresh_token: sesion.renovar });
    return sesion.token;
  }

  function cerrarSesion() {
    sesion = null;
    guardarLocal(LLAVE_SESION, null);
    historial = []; adjuntos = []; listos = [];
    location.reload();
  }

  async function api(accion, datos = {}) {
    let t;
    try { t = await token(); } catch (_) { cerrarSesion(); throw new Error("Tu sesión venció."); }
    const r = await fetch(`${CFG.supabaseUrl}/functions/v1/editor`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, apikey: CFG.supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ accion, ...datos }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { cerrarSesion(); }
    if (!r.ok) throw new Error(d.error || "Algo falló. Intenta de nuevo.");
    return d;
  }

  // ---------- Fotos ----------
  let adjuntos = []; // todas las fotos de la conversación: {id, base64, ext, url}
  let listos = [];   // fotos elegidas para el próximo mensaje
  let numFoto = 0;

  async function convertir(archivo) {
    const bmp = await createImageBitmap(archivo, { imageOrientation: "from-image" });
    const escala = Math.min(1, 720 / bmp.width, 860 / bmp.height);
    const w = Math.round(bmp.width * escala), h = Math.round(bmp.height * escala);
    const lienzo = document.createElement("canvas");
    lienzo.width = w; lienzo.height = h;
    const ctx = lienzo.getContext("2d");
    ctx.drawImage(bmp, 0, 0, w, h);
    const aBlob = (tipo) => new Promise((ok) => lienzo.toBlob(ok, tipo, 0.85));
    let blob = await aBlob("image/webp"), ext = "webp";
    if (!blob || blob.type !== "image/webp") {
      // Safari no sabe crear .webp: usamos .jpg con fondo blanco.
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      blob = await aBlob("image/jpeg"); ext = "jpg";
    }
    const base64 = await new Promise((ok, mal) => {
      const lector = new FileReader();
      lector.onload = () => ok(String(lector.result).split(",")[1]);
      lector.onerror = mal;
      lector.readAsDataURL(blob);
    });
    return { id: `foto-${++numFoto}`, base64, ext, url: URL.createObjectURL(blob) };
  }

  function pintarListos() {
    const caja = $("#fotos-listas");
    caja.replaceChildren(...listos.map((f) => {
      const quitar = el("button", { type: "button", "aria-label": `Quitar ${f.id}`, text: "×" });
      quitar.onclick = () => { listos = listos.filter((x) => x !== f); pintarListos(); };
      return el("div", { class: "foto-lista" }, el("img", { src: f.url, alt: f.id }), el("span", { text: f.id }), quitar);
    }));
    caja.hidden = !listos.length;
  }

  $("#archivo").addEventListener("change", async (e) => {
    for (const archivo of e.target.files) {
      try { listos.push(await convertir(archivo)); } catch (_) { agregarError(`No pude abrir la foto ${archivo.name}.`); }
    }
    e.target.value = "";
    pintarListos();
  });

  // ---------- Chat ----------
  let historial = []; // mensajes en el formato de la API de Claude
  let ocupado = false;
  const mensajes = $("#mensajes");
  const bajar = () => { mensajes.scrollTop = mensajes.scrollHeight; };

  function agregarMio(texto, fotos) {
    $("#bienvenida").hidden = true;
    const n = el("div", { class: "msj msj-yo" });
    if (fotos.length) n.append(el("div", { class: "msj-fotos" }, fotos.map((f) => el("img", { src: f.url, alt: f.id, title: f.id }))));
    if (texto) n.append(texto);
    mensajes.append(n); bajar();
  }
  function agregarSuyo(texto, cambios = []) {
    const n = el("div", { class: "msj msj-el" }, texto);
    if (cambios.length) n.append(el("ul", { class: "msj-cambios" }, cambios.map((c) => el("li", { text: c }))));
    mensajes.append(n); bajar();
  }
  function agregarError(texto) { mensajes.append(el("div", { class: "msj msj-error", role: "alert", text: texto })); bajar(); }

  async function enviar(texto) {
    texto = texto.trim();
    if (ocupado || (!texto && !listos.length)) return;
    const fotos = listos; listos = []; pintarListos();
    adjuntos.push(...fotos);
    agregarMio(texto, fotos);

    const contenido = [];
    for (const f of fotos) {
      contenido.push({ type: "text", text: `Adjunto ${f.id}:` });
      contenido.push({ type: "image", source: { type: "base64", media_type: f.ext === "jpg" ? "image/jpeg" : "image/webp", data: f.base64 } });
    }
    contenido.push({ type: "text", text: texto || "Te mando estas fotos." });
    const pedido = [...historial, { role: "user", content: contenido }];

    ocupado = true; $("#enviar").disabled = true;
    const esperando = el("div", { class: "pensando", "aria-label": "Pensando" }, el("i"), el("i"), el("i"));
    mensajes.append(esperando); bajar();
    try {
      const r = await api("chat", { mensajes: pedido, adjuntos: adjuntos.map(({ id, base64, ext }) => ({ id, base64, ext })) });
      historial = [...pedido, ...r.nuevos];
      agregarSuyo(r.texto, r.cambios);
      if (r.cambios.length) cargarPendientes();
    } catch (e) {
      agregarError(e.message); // el historial no cambia: se puede volver a intentar
    } finally {
      esperando.remove();
      ocupado = false; $("#enviar").disabled = false;
      $("#texto").focus();
    }
  }

  const caja = $("#texto");
  const ajustar = () => { caja.style.height = "auto"; caja.style.height = Math.min(caja.scrollHeight, 180) + "px"; };
  caja.addEventListener("input", ajustar);
  caja.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(pointer: fine)").matches) {
      e.preventDefault(); $("#redactar").requestSubmit();
    }
  });
  $("#redactar").addEventListener("submit", (e) => {
    e.preventDefault();
    const t = caja.value; caja.value = ""; ajustar();
    enviar(t);
  });
  for (const b of document.querySelectorAll(".idea")) b.onclick = () => { caja.value = b.textContent; ajustar(); caja.focus(); };
  $("#nueva").onclick = () => {
    if (ocupado) return;
    historial = []; adjuntos = []; listos = []; pintarListos();
    mensajes.replaceChildren($("#bienvenida")); $("#bienvenida").hidden = false;
  };

  // ---------- Pendientes ----------
  const NOMBRES = { "Notas de salida": "Salida", "Notas de corazón": "Corazón", "Notas de fondo": "Fondo", "Notas aproximadas": "Notas aprox.", "Concentración": "Concentración", Imagen: "Foto" };
  const nombreCampo = (k) => NOMBRES[k] || k;
  const valor = (k, v) => (k === "Imagen" ? (v ? "sí" : "no") : v || "—");

  function tarjeta(c) {
    const tipos = { agregado: "Nuevo", editado: "Editado", quitado: "Quitado" };
    const t = el("article", { class: `cambio cambio-${c.tipo}` },
      el("div", { class: "cambio-tipo", text: tipos[c.tipo] }),
      el("div", { class: "cambio-nombre" }, c.nombre + " ", el("span", { class: "cambio-ref", text: c.ref })));
    if (c.tipo === "agregado") {
      const p = c.despues;
      t.append(el("dl", {},
        ["Público", "Línea", "Familia", "Notas de salida", "Notas de corazón", "Notas de fondo", "Imagen"].flatMap((k) =>
          [el("dt", { text: nombreCampo(k) }), el("dd", { text: valor(k, p[k]) })])));
    }
    if (c.tipo === "editado") {
      t.append(el("dl", {}, c.campos.flatMap((k) => [
        el("dt", { text: nombreCampo(k) }),
        k === "Imagen"
          ? el("dd", { text: c.antes[k] ? "foto nueva" : "se agregó foto" })
          : el("dd", {}, el("del", { text: valor(k, c.antes[k]) }), " → ", el("ins", { text: valor(k, c.despues[k]) })),
      ])));
    }
    return t;
  }

  let puedePublicar = false;
  async function cargarPendientes() {
    const lista = $("#lista-pendientes");
    try {
      const b = await api("borrador");
      const n = b.cambios.length + b.tienda.length;
      $("#contador").hidden = !n; $("#contador").textContent = n;
      $("#acciones").hidden = !b.hay;
      if (!b.hay) { lista.replaceChildren(el("p", { class: "sutil", text: "No hay cambios pendientes. La página está igual a lo publicado." })); return; }
      const items = b.cambios.map(tarjeta);
      for (const x of b.tienda) {
        items.push(el("article", { class: "cambio cambio-editado" },
          el("div", { class: "cambio-tipo", text: "Datos de la tienda" }),
          el("dl", {}, el("dt", { text: x.campo }), el("dd", {}, el("del", { text: String(x.antes || "—") }), " → ", el("ins", { text: String(x.despues || "—") })))));
      }
      if (!items.length) items.push(el("p", { class: "sutil", text: "Hay cambios guardados que no son del catálogo." }));
      lista.replaceChildren(...items);
    } catch (e) {
      lista.replaceChildren(el("p", { class: "error", text: e.message }));
    }
  }
  $("#refrescar").onclick = cargarPendientes;

  // Botones con doble confirmación (sin ventanas emergentes).
  function confirmar(boton, textoConfirmar, accion) {
    const original = boton.textContent;
    let armado = false, reloj;
    boton.addEventListener("click", async () => {
      if (!armado) {
        armado = true; boton.textContent = textoConfirmar;
        reloj = setTimeout(() => { armado = false; boton.textContent = original; }, 5000);
        return;
      }
      clearTimeout(reloj); armado = false; boton.textContent = original;
      const res = $("#resultado");
      res.className = "resultado"; res.textContent = "Un momento…";
      boton.disabled = true;
      try { const r = await accion(); res.textContent = r.mensaje; await cargarPendientes(); }
      catch (e) { res.className = "resultado mal"; res.textContent = e.message; }
      finally { boton.disabled = false; }
    });
  }
  confirmar($("#publicar"), "¿Seguro? Toca otra vez para publicar", () => api("publicar"));
  confirmar($("#descartar"), "¿Borrar todo lo pendiente? Toca otra vez", () => api("descartar"));

  // ---------- Pestañas en celular ----------
  const app = $("#pantalla-editor");
  app.dataset.ver = "chat";
  for (const p of document.querySelectorAll(".pestana")) {
    p.onclick = () => {
      app.dataset.ver = p.dataset.ver;
      for (const q of document.querySelectorAll(".pestana")) q.classList.toggle("activa", q === p);
      if (p.dataset.ver === "pendientes") cargarPendientes();
    };
  }

  // ---------- Arranque ----------
  $("#salir").onclick = cerrarSesion;
  $("#form-entrar").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#entrar-error"); err.hidden = true;
    const boton = e.target.querySelector("button"); boton.disabled = true;
    try {
      await auth("password", { email: $("#correo").value.trim(), password: $("#clave").value });
      await iniciar();
    } catch (x) {
      err.textContent = /invalid/i.test(x.message) ? "Correo o contraseña incorrectos." : x.message;
      err.hidden = false;
    } finally { boton.disabled = false; }
  });

  async function iniciar() {
    if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) return mostrar("#pantalla-config");
    if (!sesion) return mostrar("#pantalla-entrar");
    try {
      const yo = await api("sesion");
      puedePublicar = yo.publica;
      $("#usuario").textContent = yo.nombre;
      $("#publicar").hidden = $("#descartar").hidden = !puedePublicar;
      $("#nota-publicar").textContent = puedePublicar
        ? "Revisa la lista. Al publicar, la página se actualiza en uno o dos minutos."
        : "Quien publica revisará estos cambios y los subirá a la página.";
      mostrar("#pantalla-editor");
      cargarPendientes();
      $("#texto").focus();
    } catch (_) {
      mostrar("#pantalla-entrar");
    }
  }
  iniciar();
})();
