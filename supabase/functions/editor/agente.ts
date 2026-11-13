// El agente: herramientas que Claude puede usar sobre el borrador del sitio.
// Todo lo que cambia en un turno se guarda en un solo commit al final.

import type Anthropic from "npm:@anthropic-ai/sdk@1.8.0";
import {
  aplicarCambios, buscar, cambiarTienda, CAMPOS_TIENDA, describir, escribirCatalogo, FAMILIAS, fotoJs,
  insertar, leerCatalogo, leerTienda, LINEAS, normalizarCambios, type Catalogo, type Perfume, PUBLICOS, siguienteRef,
} from "./catalogo.ts";
import type { ArchivoNuevo, GitHub } from "./github.ts";

const RUTA_CATALOGO = "data/catalogo.js";
const RUTA_CONFIG = "config.js";

export const SISTEMA = `Eres el editor del sitio web de Vorágine by Alttura (voraginebyalttura.com), una perfumería en Colombia que vende fragancias de diseñador, nicho y árabes. El equipo de la tienda te escribe en español para cambiar el catálogo y los datos de la tienda sin tocar código.

Cómo trabajas:
- Todo lo que cambias queda en un BORRADOR. Nada sale en la página hasta que una persona autorizada pulsa "Publicar" en el panel. Nunca digas que algo ya está publicado.
- Antes de agregar un perfume, búscalo para no duplicarlo. Si ya existe, dilo y pregunta si quieren editarlo.
- Antes de editar o quitar, busca el perfume y asegúrate de que es el correcto. Si hay varios parecidos (por ejemplo "Good Girl" y "Good Girl Blush"), pregunta cuál.
- Para quitar un perfume, si la persona no lo pidió de forma clara e inequívoca, confirma primero.
- Si te piden agregar un perfume y no dan las notas olfativas, complétalas tú con lo que sabes del perfume (salida, corazón y fondo, 2 a 4 notas cada una) y márcalas con notas_aproximadas = true. Si no conoces el perfume, pregunta en vez de inventar.
- Público, línea y familia solo pueden tomar estos valores: público ${PUBLICOS.join("/")}; línea ${LINEAS.join("/")}; familia ${FAMILIAS.join("/")}. Elige el más cercano según el perfume.
- No inventes precios. La tienda cotiza por WhatsApp; solo pon un precio si te lo dan.
- Las fotos llegan como adjuntos con un nombre (foto-1, foto-2…). Úsalas con poner_foto. Si no está claro de qué perfume es una foto, pregunta. Una buena foto muestra solo el frasco, de frente, con fondo limpio; si la foto es muy mala (borrosa, varios productos, mano tapando), avísalo.
- Puedes hacer varios cambios en un mismo turno.
- Al terminar, responde en 1 a 4 frases, en español de Colombia, tuteando: qué cambiaste (con nombre y referencia) y que queda en el borrador para revisar y publicar. Sin tecnicismos (no hables de archivos, ramas ni código).
- Solo puedes editar perfumes, fotos y los datos de la tienda. Si te piden otra cosa (diseño, textos de la página, colores), di que eso todavía no se puede desde el editor y que lo pidan a Juam.`;

export const HERRAMIENTAS: Anthropic.Beta.BetaTool[] = [
  {
    name: "buscar_perfumes",
    description: "Busca perfumes en el catálogo (borrador) por nombre, marca, referencia PERF-xxx o nota. Ignora tildes y mayúsculas. Devuelve hasta 15 resultados con sus datos.",
    input_schema: {
      type: "object",
      properties: { texto: { type: "string", description: "Lo que se busca, por ejemplo 'good girl', 'lattafa', 'PERF-316' o 'vainilla'" } },
      required: ["texto"],
    },
  },
  {
    name: "agregar_perfume",
    description: "Agrega un perfume nuevo al catálogo. Le asigna la siguiente referencia PERF-xxx. Puede ponerle una foto adjunta de una vez.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string" },
        marca: { type: "string" },
        publico: { type: "string", enum: [...PUBLICOS] },
        linea: { type: "string", enum: [...LINEAS] },
        familia: { type: "string", enum: [...FAMILIAS] },
        concentracion: { type: "string", enum: ["", "Intense", "Elixir", "Parfum"], description: "Vacío si es la versión normal" },
        notas_salida: { type: "string", description: "Separadas por coma, en español. Ej: 'Bergamota, pimienta rosa'" },
        notas_corazon: { type: "string" },
        notas_fondo: { type: "string" },
        notas_aproximadas: { type: "boolean", description: "true si las notas las completaste tú y no las dio la tienda" },
        descripcion: { type: "string", description: "Opcional. Una o dos frases para la ficha" },
        precio: { type: "string", description: "Opcional. Solo si la tienda lo dio. Solo números, en pesos" },
        foto: { type: "string", description: "Opcional. Nombre del adjunto, por ejemplo 'foto-1'" },
      },
      required: ["nombre", "marca", "publico", "linea", "familia", "notas_salida", "notas_corazon", "notas_fondo"],
    },
  },
  {
    name: "editar_perfume",
    description: "Cambia uno o varios datos de un perfume existente. Solo manda los campos que cambian. Para borrar un campo opcional (descripción, precio, notas aproximadas) mándalo vacío.",
    input_schema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Referencia PERF-xxx" },
        nombre: { type: "string" },
        marca: { type: "string" },
        publico: { type: "string", enum: [...PUBLICOS] },
        linea: { type: "string", enum: [...LINEAS] },
        familia: { type: "string", enum: [...FAMILIAS] },
        concentracion: { type: "string", enum: ["", "Intense", "Elixir", "Parfum"] },
        notas_salida: { type: "string" },
        notas_corazon: { type: "string" },
        notas_fondo: { type: "string" },
        notas_aproximadas: { type: "boolean" },
        descripcion: { type: "string" },
        precio: { type: "string" },
      },
      required: ["ref"],
    },
  },
  {
    name: "quitar_perfume",
    description: "Quita un perfume del catálogo (por ejemplo, porque ya no se vende).",
    input_schema: {
      type: "object",
      properties: { ref: { type: "string", description: "Referencia PERF-xxx" } },
      required: ["ref"],
    },
  },
  {
    name: "poner_foto",
    description: "Pone o reemplaza la foto de un perfume con una foto adjunta.",
    input_schema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Referencia PERF-xxx" },
        foto: { type: "string", description: "Nombre del adjunto, por ejemplo 'foto-1'" },
      },
      required: ["ref", "foto"],
    },
  },
  {
    name: "ver_tienda",
    description: "Muestra los datos generales de la tienda: nombre, eslogan, WhatsApp, mensajes de cotización, envíos, Instagram y si se muestran precios.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "cambiar_tienda",
    description: `Cambia un dato general de la tienda. Campos: ${Object.keys(CAMPOS_TIENDA).join(", ")}. En 'mensaje' se pueden usar {nombre}, {marca} y {ref}. 'mostrarPrecios' es true o false.`,
    input_schema: {
      type: "object",
      properties: {
        campo: { type: "string", enum: Object.keys(CAMPOS_TIENDA) },
        valor: { type: "string" },
      },
      required: ["campo", "valor"],
    },
  },
  {
    name: "resumen_catalogo",
    description: "Cuenta cuántos perfumes hay en total, cuántos sin foto, y por línea, público y familia. Úsalo si preguntan por el estado del catálogo o qué perfumes no tienen foto (lista hasta 40 sin foto).",
    input_schema: { type: "object", properties: {} },
  },
];

export interface Adjunto {
  base64: string; // imagen en base64
  ext: "webp" | "jpg"; // el panel la convierte a webp; si el navegador no puede (Safari), a jpg
}

// Estado de un turno: lee el borrador una sola vez y junta los cambios.
export class Turno {
  private base = "";
  private catalogo?: Catalogo;
  private config?: string;
  private fotos = new Map<string, Adjunto>();
  private catalogoCambiado = false;
  private configCambiado = false;
  readonly cambios: string[] = [];
  private operaciones: [string, Record<string, unknown>][] = []; // para repetirlas si hay choque

  constructor(private gh: GitHub, private adjuntos: Map<string, Adjunto>) {}

  private async cargar() {
    if (!this.base) this.base = await this.gh.prepararBorrador();
  }
  private async cat(): Promise<Catalogo> {
    await this.cargar();
    this.catalogo ??= leerCatalogo(await this.gh.leer(RUTA_CATALOGO, this.base));
    return this.catalogo;
  }
  private async cfg(): Promise<string> {
    await this.cargar();
    this.config ??= await this.gh.leer(RUTA_CONFIG, this.base);
    return this.config;
  }
  private async buscarRef(ref: string): Promise<[Catalogo, number]> {
    const c = await this.cat();
    const r = ref.trim().toUpperCase();
    const i = c.perfumes.findIndex((p) => p.Ref.toUpperCase() === r);
    if (i < 0) throw new Error(`No existe el perfume ${ref}. Búscalo con buscar_perfumes.`);
    return [c, i];
  }
  private foto(ref: string, adjunto: string): string {
    const a = this.adjuntos.get(adjunto.trim());
    if (!a) throw new Error(`No encuentro el adjunto "${adjunto}". Adjuntos disponibles: ${[...this.adjuntos.keys()].join(", ") || "ninguno"}`);
    const ruta = `img/perfumes/${ref}.${a.ext}`;
    this.fotos.set(ruta, a);
    return ruta;
  }

  async ejecutar(nombre: string, entrada: Record<string, unknown>): Promise<string> {
    const antes = this.cambios.length;
    const salida = await this.ejecutarSinRegistro(nombre, entrada);
    if (this.cambios.length > antes) this.operaciones.push([nombre, entrada]);
    return salida;
  }

  private async ejecutarSinRegistro(nombre: string, entrada: Record<string, unknown>): Promise<string> {
    switch (nombre) {
      case "buscar_perfumes": {
        const r = buscar((await this.cat()).perfumes, String(entrada.texto ?? ""));
        return r.length ? r.map(describir).join("\n\n") : "No encontré ningún perfume con eso.";
      }
      case "agregar_perfume": {
        const c = await this.cat();
        const { foto, ...resto } = entrada;
        const datos = normalizarCambios(resto);
        for (const k of ["Nombre", "Marca", "Público", "Línea", "Familia"]) {
          if (!datos[k]) throw new Error(`Falta ${k}`);
        }
        const ref = siguienteRef(c.perfumes);
        let p: Perfume = aplicarCambios({ Ref: ref, "Concentración": "" }, datos);
        if (foto) p = { ...p, Imagen: this.foto(ref, String(foto)) };
        c.perfumes = insertar(c.perfumes, p);
        this.catalogoCambiado = true;
        this.cambios.push(`Agrega ${p.Nombre} de ${p.Marca} (${ref})${foto ? " con foto" : ""}`);
        return `Agregado:\n${describir(p)}`;
      }
      case "editar_perfume": {
        const { ref, ...resto } = entrada;
        const [c, i] = await this.buscarRef(String(ref));
        const datos = normalizarCambios(resto);
        if (!Object.keys(datos).length) return "No mandaste ningún campo para cambiar.";
        const antes = c.perfumes[i];
        c.perfumes[i] = aplicarCambios(antes, datos);
        this.catalogoCambiado = true;
        this.cambios.push(`Edita ${antes.Nombre} (${antes.Ref}): ${Object.keys(datos).join(", ").toLowerCase()}`);
        return `Quedó así:\n${describir(c.perfumes[i])}`;
      }
      case "quitar_perfume": {
        const [c, i] = await this.buscarRef(String(entrada.ref));
        const [p] = c.perfumes.splice(i, 1);
        this.catalogoCambiado = true;
        this.cambios.push(`Quita ${p.Nombre} de ${p.Marca} (${p.Ref})`);
        return `Quitado: ${p.Ref} · ${p.Nombre} de ${p.Marca}`;
      }
      case "poner_foto": {
        const [c, i] = await this.buscarRef(String(entrada.ref));
        const p = c.perfumes[i];
        const tenia = Boolean(p.Imagen);
        c.perfumes[i] = { ...p, Imagen: this.foto(p.Ref, String(entrada.foto)) };
        this.catalogoCambiado = true;
        this.cambios.push(`${tenia ? "Cambia" : "Pone"} la foto de ${p.Nombre} (${p.Ref})`);
        return `Foto ${tenia ? "reemplazada" : "agregada"} para ${p.Ref} · ${p.Nombre}`;
      }
      case "ver_tienda":
        return JSON.stringify(leerTienda(await this.cfg()), null, 2);
      case "cambiar_tienda": {
        const campo = String(entrada.campo);
        const antes = leerTienda(await this.cfg())[campo];
        this.config = cambiarTienda(await this.cfg(), campo, String(entrada.valor));
        const despues = leerTienda(this.config)[campo];
        this.configCambiado = true;
        this.cambios.push(`Cambia ${campo} de la tienda`);
        return `${campo}: ${JSON.stringify(antes)} → ${JSON.stringify(despues)}`;
      }
      case "resumen_catalogo": {
        const ps = (await this.cat()).perfumes;
        const contar = (k: string) => Object.entries(ps.reduce<Record<string, number>>((a, p) => ((a[p[k] || "—"] = (a[p[k] || "—"] ?? 0) + 1), a), {}))
          .map(([v, n]) => `${v}: ${n}`).join(", ");
        const sinFoto = ps.filter((p) => !p.Imagen);
        return [
          `Total: ${ps.length} perfumes. Con foto: ${ps.length - sinFoto.length}. Sin foto: ${sinFoto.length}.`,
          `Línea → ${contar("Línea")}`,
          `Público → ${contar("Público")}`,
          `Familia → ${contar("Familia")}`,
          `Sin foto (primeros 40): ${sinFoto.slice(0, 40).map((p) => `${p.Ref} ${p.Nombre} (${p.Marca})`).join("; ")}`,
        ].join("\n");
      }
      default:
        throw new Error(`Herramienta desconocida: ${nombre}`);
    }
  }

  // Guarda todo lo del turno en un commit. Devuelve false si no hubo cambios.
  async guardar(autor: { name: string; email: string }, reintento = true): Promise<boolean> {
    if (!this.cambios.length) return false;
    const archivos: ArchivoNuevo[] = [];
    if (this.catalogoCambiado && this.catalogo) archivos.push({ ruta: RUTA_CATALOGO, texto: escribirCatalogo(this.catalogo) });
    if (this.configCambiado && this.config) archivos.push({ ruta: RUTA_CONFIG, texto: this.config });
    for (const [ruta, a] of this.fotos) {
      archivos.push({ ruta, base64: a.base64 });
      archivos.push({ ruta: ruta.replace(/\.\w+$/, ".js"), texto: fotoJs(ruta, a.base64, a.ext) });
    }
    const titulo = this.cambios.length === 1 ? this.cambios[0] : `${this.cambios.length} cambios desde el editor`;
    const cuerpo = this.cambios.length > 1 ? "\n\n" + this.cambios.map((c) => `- ${c}`).join("\n") : "";
    try {
      await this.gh.guardar(this.base, archivos, `${titulo}${cuerpo}\n\nHecho por ${autor.name} desde el editor.`, autor);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (!reintento || (status !== 409 && status !== 422)) throw e;
      // Otra persona guardó mientras tanto: releemos el borrador y repetimos lo mismo encima.
      const ops = this.operaciones;
      this.base = ""; this.catalogo = undefined; this.config = undefined;
      this.fotos.clear(); this.catalogoCambiado = this.configCambiado = false;
      this.cambios.length = 0; this.operaciones = [];
      for (const [nombre, entrada] of ops) await this.ejecutar(nombre, entrada);
      return this.guardar(autor, false);
    }
    return true;
  }
}

export class ErrorUsuario extends Error {
  constructor(msg: string, readonly status = 400) { super(msg); }
}

const MAX_VUELTAS = 12;

// Un turno de conversación: llama a Claude, ejecuta las herramientas que pida
// hasta que termine, y guarda los cambios en el borrador en un solo commit.
export async function conversar(
  claude: Anthropic,
  opciones: { modelo: string; esfuerzo: "low" | "medium" | "high" },
  gh: GitHub,
  historial: Anthropic.Beta.BetaMessageParam[],
  adjuntos: Map<string, Adjunto>,
  autor: { name: string; email: string },
) {
  const turno = new Turno(gh, adjuntos);
  const mensajes = [...historial];
  const nuevos: Anthropic.Beta.BetaMessageParam[] = [];
  let rechazo = false;

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const r = await claude.beta.messages.create({
      model: opciones.modelo,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: opciones.esfuerzo },
      system: [{ type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } }],
      tools: HERRAMIENTAS,
      messages: mensajes,
    });
    rechazo = r.stop_reason === "refusal";
    const contenido = r.content.length ? r.content : [{ type: "text" as const, text: "No puedo ayudar con eso desde el editor.", citations: null }];
    const asistente: Anthropic.Beta.BetaMessageParam = { role: "assistant", content: contenido as Anthropic.Beta.BetaContentBlockParam[] };
    mensajes.push(asistente);
    nuevos.push(asistente);

    if (r.stop_reason === "pause_turn") continue;
    if (r.stop_reason !== "tool_use") break; // end_turn, refusal, max_tokens…

    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const b of r.content) {
      if (b.type !== "tool_use") continue;
      try {
        const salida = await turno.ejecutar(b.name, (b.input ?? {}) as Record<string, unknown>);
        resultados.push({ type: "tool_result", tool_use_id: b.id, content: salida });
      } catch (e) {
        resultados.push({ type: "tool_result", tool_use_id: b.id, content: (e as Error).message, is_error: true });
      }
    }
    const usuario: Anthropic.Beta.BetaMessageParam = { role: "user", content: resultados };
    mensajes.push(usuario);
    nuevos.push(usuario);
  }

  // Si se acabaron las vueltas justo después de usar herramientas, cerramos
  // con un mensaje para que el historial quede válido para el próximo turno.
  if (nuevos.at(-1)?.role === "user") {
    nuevos.push({ role: "assistant", content: [{ type: "text", text: "Hice una parte, pero el pedido era largo y me detuve. Revisa los cambios pendientes y dime si sigo." }] });
  }

  try {
    await turno.guardar(autor);
  } catch (e) {
    console.error(e);
    throw new ErrorUsuario("No pude guardar los cambios porque alguien más guardó al mismo tiempo. Vuelve a pedirlo.", 409);
  }

  const ultimo = nuevos.findLast((m) => m.role === "assistant");
  const texto = Array.isArray(ultimo?.content)
    ? ultimo.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim()
    : "";
  return { nuevos, texto: texto || (rechazo ? "No puedo ayudar con eso desde el editor." : "Listo."), cambios: turno.cambios };
}
