// Lógica pura del catálogo y de config.js: leer, cambiar y volver a escribir
// los archivos con el mismo formato que tienen hoy (así los cambios en GitHub
// muestran solo las líneas que de verdad cambiaron).
// No depende de Deno ni de npm, para poder probarla con Node.

export type Perfume = Record<string, string>;

export const PUBLICOS = ["Dama", "Caballero", "Unisex"] as const;
export const LINEAS = ["Diseñador", "Nicho", "Árabe"] as const;
export const FAMILIAS = ["Floral", "Oriental", "Fresca", "Gourmand", "Amaderada"] as const;
export const CONCENTRACIONES = ["", "Intense", "Elixir", "Parfum"] as const;

// Orden de los campos dentro de cada perfume, igual al archivo actual.
const ORDEN = [
  "Ref", "Nombre", "Marca", "Público", "Línea", "Familia", "Concentración",
  "Notas de salida", "Notas de corazón", "Notas de fondo", "Notas aproximadas",
  "Descripción", "Precio", "Imagen",
];

// Nombres cortos que usa el agente → nombre del campo en el catálogo.
export const CAMPOS: Record<string, string> = {
  nombre: "Nombre",
  marca: "Marca",
  publico: "Público",
  linea: "Línea",
  familia: "Familia",
  concentracion: "Concentración",
  notas_salida: "Notas de salida",
  notas_corazon: "Notas de corazón",
  notas_fondo: "Notas de fondo",
  notas_aproximadas: "Notas aproximadas",
  descripcion: "Descripción",
  precio: "Precio",
};

export interface Catalogo {
  encabezado: string;
  perfumes: Perfume[];
}

export function leerCatalogo(texto: string): Catalogo {
  const inicio = texto.indexOf("[");
  const fin = texto.lastIndexOf("]");
  if (inicio < 0 || fin < inicio) throw new Error("data/catalogo.js no tiene la lista de perfumes");
  return {
    encabezado: texto.slice(0, inicio),
    perfumes: JSON.parse(texto.slice(inicio, fin + 1)),
  };
}

function ordenar(p: Perfume): [string, string][] {
  const conocidos = ORDEN.filter((k) => k in p).map((k) => [k, p[k]] as [string, string]);
  const otros = Object.entries(p).filter(([k]) => !ORDEN.includes(k));
  return [...conocidos, ...otros];
}

export function escribirCatalogo(c: Catalogo): string {
  const n = c.perfumes.length;
  const encabezado = c.encabezado.replace(/: \d+ referencias/, `: ${n} referencias`);
  const cuerpo = c.perfumes
    .map((p) => "{\n" + ordenar(p).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n") + "\n}")
    .join(",\n");
  return `${encabezado}[\n${cuerpo}\n];\n`;
}

export function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function buscar(perfumes: Perfume[], texto: string, limite = 15): Perfume[] {
  const palabras = sinTildes(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const puntaje = (p: Perfume) => {
    const nombre = sinTildes(`${p.Nombre} ${p.Marca}`);
    const todo = sinTildes(Object.values(p).join(" "));
    if (!palabras.every((w) => todo.includes(w))) return 0;
    let s = 1;
    if (palabras.every((w) => nombre.includes(w))) s += 2;
    if (sinTildes(p.Ref) === palabras.join(" ")) s += 10;
    if (sinTildes(p.Nombre) === palabras.join(" ")) s += 5;
    return s;
  };
  return perfumes
    .map((p) => [puntaje(p), p] as const)
    .filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0])
    .slice(0, limite)
    .map(([, p]) => p);
}

export function siguienteRef(perfumes: Perfume[], usadas: Iterable<string> = []): string {
  let max = 0;
  for (const r of [...perfumes.map((p) => p.Ref), ...usadas]) {
    const m = /^PERF-(\d+)$/.exec(r);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `PERF-${String(max + 1).padStart(3, "0")}`;
}

function elegir(valor: string, opciones: readonly string[], campo: string): string {
  const v = sinTildes(valor);
  const hallado = opciones.find((o) => sinTildes(o) === v);
  if (hallado === undefined) {
    throw new Error(`${campo} debe ser uno de: ${opciones.filter(Boolean).join(", ")}${opciones.includes("") ? " (o vacío)" : ""}`);
  }
  return hallado;
}

// Valida y normaliza un cambio con nombres cortos. Devuelve los campos del catálogo.
export function normalizarCambios(cambios: Record<string, unknown>): Perfume {
  const salida: Perfume = {};
  for (const [corto, bruto] of Object.entries(cambios)) {
    if (bruto === undefined || bruto === null) continue;
    const campo = CAMPOS[corto];
    if (!campo) throw new Error(`No conozco el campo "${corto}"`);
    let valor = String(bruto).trim().replace(/\s+/g, " ");
    if (corto === "publico") valor = elegir(valor, PUBLICOS, "Público");
    if (corto === "linea") valor = elegir(valor, LINEAS, "Línea");
    if (corto === "familia") valor = elegir(valor, FAMILIAS, "Familia");
    if (corto === "concentracion") valor = elegir(valor, CONCENTRACIONES, "Concentración");
    if (corto === "notas_aproximadas") {
      valor = bruto === true || /^(s|true)/i.test(valor) ? "sí" : "";
    }
    if (corto === "precio" && valor) {
      const n = valor.replace(/[^\d]/g, "");
      if (!n) throw new Error("El precio debe ser un número, por ejemplo 250000");
      valor = n;
    }
    if ((corto === "nombre" || corto === "marca") && !valor) throw new Error(`${campo} no puede quedar vacío`);
    salida[campo] = valor;
  }
  return salida;
}

export function aplicarCambios(p: Perfume, cambios: Perfume): Perfume {
  const nuevo: Perfume = { ...p };
  for (const [k, v] of Object.entries(cambios)) {
    // Campos opcionales: si quedan vacíos se quitan del perfume.
    if (v === "" && ["Notas aproximadas", "Descripción", "Precio"].includes(k)) delete nuevo[k];
    else nuevo[k] = v;
  }
  return nuevo;
}

// Inserta un perfume nuevo justo después del último de la misma marca
// (así la vitrina mantiene juntas las marcas); si la marca es nueva, al final.
export function insertar(perfumes: Perfume[], p: Perfume): Perfume[] {
  const marca = sinTildes(p.Marca || "");
  let pos = -1;
  perfumes.forEach((q, i) => { if (sinTildes(q.Marca || "") === marca) pos = i; });
  const copia = [...perfumes];
  copia.splice(pos >= 0 ? pos + 1 : copia.length, 0, p);
  return copia;
}

export function describir(p: Perfume): string {
  const partes = [`${p.Ref} · ${p.Nombre}${p.Marca ? ` de ${p.Marca}` : ""}`];
  partes.push(`${p["Público"]} · ${p["Línea"]} · ${p.Familia}${p["Concentración"] ? ` · ${p["Concentración"]}` : ""}`);
  partes.push(`Salida: ${p["Notas de salida"] || "—"} | Corazón: ${p["Notas de corazón"] || "—"} | Fondo: ${p["Notas de fondo"] || "—"}${p["Notas aproximadas"] ? " (notas aproximadas)" : ""}`);
  if (p["Descripción"]) partes.push(`Descripción: ${p["Descripción"]}`);
  if (p.Precio) partes.push(`Precio: ${p.Precio}`);
  partes.push(p.Imagen ? `Foto: sí (${p.Imagen})` : "Foto: no tiene");
  return partes.join("\n");
}

// ---------- Diferencias entre dos versiones del catálogo ----------

export interface Diferencia {
  tipo: "agregado" | "quitado" | "editado";
  ref: string;
  nombre: string;
  antes?: Perfume;
  despues?: Perfume;
  campos?: string[];
}

export function diferencias(antes: Perfume[], despues: Perfume[]): Diferencia[] {
  const a = new Map(antes.map((p) => [p.Ref, p]));
  const d = new Map(despues.map((p) => [p.Ref, p]));
  const out: Diferencia[] = [];
  for (const [ref, p] of d) {
    const q = a.get(ref);
    if (!q) { out.push({ tipo: "agregado", ref, nombre: `${p.Nombre} · ${p.Marca}`, despues: p }); continue; }
    const campos = [...new Set([...Object.keys(p), ...Object.keys(q)])].filter((k) => (p[k] ?? "") !== (q[k] ?? ""));
    if (campos.length) out.push({ tipo: "editado", ref, nombre: `${p.Nombre} · ${p.Marca}`, antes: q, despues: p, campos });
  }
  for (const [ref, q] of a) {
    if (!d.has(ref)) out.push({ tipo: "quitado", ref, nombre: `${q.Nombre} · ${q.Marca}`, antes: q });
  }
  return out;
}

// ---------- config.js ----------

export const CAMPOS_TIENDA: Record<string, "texto" | "booleano"> = {
  nombre: "texto",
  eslogan: "texto",
  whatsapp: "texto",
  mensaje: "texto",
  mensajeGeneral: "texto",
  envios: "texto",
  instagram: "texto",
  mostrarPrecios: "booleano",
  moneda: "texto",
};

export function leerTienda(texto: string): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const campo of Object.keys(CAMPOS_TIENDA)) {
    const m = new RegExp(`^\\s*${campo}:\\s*("(?:[^"\\\\]|\\\\.)*"|true|false)`, "m").exec(texto);
    if (m) out[campo] = m[1] === "true" ? true : m[1] === "false" ? false : JSON.parse(m[1]);
  }
  return out;
}

export function cambiarTienda(texto: string, campo: string, valor: string | boolean): string {
  const tipo = CAMPOS_TIENDA[campo];
  if (!tipo) throw new Error(`No conozco el dato "${campo}". Puedo cambiar: ${Object.keys(CAMPOS_TIENDA).join(", ")}`);
  let literal: string;
  if (tipo === "booleano") {
    literal = valor === true || /^(s|true)/i.test(String(valor)) ? "true" : "false";
  } else {
    let v = String(valor).trim();
    if (campo === "whatsapp") {
      v = v.replace(/\D/g, "");
      if (v.length === 10 && v.startsWith("3")) v = "57" + v; // celular colombiano sin indicativo
      if (v.length < 11) throw new Error("El WhatsApp debe llevar indicativo de país, por ejemplo 573001234567");
    }
    if (campo === "instagram" && v && !v.startsWith("@")) v = "@" + v;
    literal = JSON.stringify(v);
  }
  const re = new RegExp(`^(\\s*${campo}:\\s*)("(?:[^"\\\\]|\\\\.)*"|true|false)`, "m");
  if (!re.test(texto)) throw new Error(`No encontré "${campo}" en config.js`);
  return texto.replace(re, (_m, pre) => pre + literal);
}

// ---------- Fotos ----------

// Archivo .js que acompaña cada foto: permite abrir la página con doble clic
// (sin servidor), igual que los que ya existen en img/perfumes/.
export function fotoJs(ruta: string, base64: string, ext: "webp" | "jpg" = "webp"): string {
  const tipo = ext === "jpg" ? "jpeg" : "webp";
  return `window.__foto&&window.__foto(${JSON.stringify(ruta)},"data:image/${tipo};base64,${base64}");\n`;
}
