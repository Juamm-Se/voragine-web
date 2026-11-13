// Servidor del Editor Vorágine (Supabase Edge Function).
//
// Recibe las peticiones del panel (editor/ en el sitio), comprueba quién es
// la persona, conversa con Claude y guarda los cambios en la rama "borrador"
// del repositorio. Publicar = unir el borrador a main con un pull request.
//
// Secretos que necesita (supabase secrets set ...):
//   ANTHROPIC_API_KEY  llave de la API de Claude
//   GITHUB_TOKEN       token de GitHub con permiso de escritura solo en este repo
//   GITHUB_REPO        juamm-se/voragine-web
//   PUBLICADORES       correos que pueden publicar, separados por coma
//   ORIGENES           opcional: dominios que pueden usar el panel (por defecto voraginebyalttura.com)
//   MODELO, ESFUERZO   opcionales: modelo de Claude y esfuerzo (por defecto claude-opus-5-5 y low)

import Anthropic from "npm:@anthropic-ai/sdk@1.8.0";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { diferencias, leerCatalogo, leerTienda } from "./catalogo.ts";
import { GitHub } from "./github.ts";
import { type Adjunto, conversar, ErrorUsuario } from "./agente.ts";

const env = (k: string, def = "") => Deno.env.get(k) ?? def;
const lista = (k: string) => env(k).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const ORIGENES = lista("ORIGENES").length
  ? lista("ORIGENES")
  : ["https://voraginebyalttura.com", "https://www.voraginebyalttura.com", "http://localhost:8000"];
const MODELO = env("MODELO", "claude-opus-5-5");
const ESFUERZO = env("ESFUERZO", "low") as "low" | "medium" | "high";

const claude = new Anthropic();
const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"));
const gh = () => new GitHub(env("GITHUB_TOKEN"), env("GITHUB_REPO", "juamm-se/voragine-web"));

function cors(origen: string | null): Record<string, string> {
  const permitido = origen && ORIGENES.includes(origen.toLowerCase()) ? origen : ORIGENES[0];
  return {
    "Access-Control-Allow-Origin": permitido,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

async function quienEs(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new ErrorUsuario("Inicia sesión para usar el editor.", 401);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) throw new ErrorUsuario("Tu sesión venció. Vuelve a iniciar sesión.", 401);
  const email = data.user.email.toLowerCase();
  const nombre = String(data.user.user_metadata?.nombre ?? data.user.user_metadata?.name ?? email.split("@")[0]);
  return { email, nombre, publica: lista("PUBLICADORES").includes(email) };
}

// ---------- Acciones ----------

async function chat(cuerpo: Record<string, unknown>, persona: Awaited<ReturnType<typeof quienEs>>) {
  const historial = (cuerpo.mensajes ?? []) as Anthropic.Beta.BetaMessageParam[];
  if (!Array.isArray(historial) || !historial.length) throw new ErrorUsuario("No llegó ningún mensaje.");
  const adjuntos = new Map<string, Adjunto>();
  for (const a of (cuerpo.adjuntos ?? []) as { id: string; base64: string; ext?: string }[]) {
    if (a?.id && a?.base64) adjuntos.set(String(a.id), { base64: String(a.base64), ext: a.ext === "jpg" ? "jpg" : "webp" });
  }
  return conversar(claude, { modelo: MODELO, esfuerzo: ESFUERZO }, gh(), historial, adjuntos, { name: persona.nombre, email: persona.email });
}

async function borrador() {
  const g = gh();
  const p = await g.pendientes();
  if (!p.borrador || !p.commits.length) return { hay: false, cambios: [], tienda: [], fotos: 0, historial: [] };
  const [catMain, catBorr] = await Promise.all([g.leer("data/catalogo.js", p.main!), g.leer("data/catalogo.js", p.borrador)]);
  const cambios = diferencias(leerCatalogo(catMain).perfumes, leerCatalogo(catBorr).perfumes);
  let tienda: { campo: string; antes: unknown; despues: unknown }[] = [];
  if (p.archivos.includes("config.js")) {
    const [a, d] = await Promise.all([g.leer("config.js", p.main!), g.leer("config.js", p.borrador)]);
    const ta = leerTienda(a), td = leerTienda(d);
    tienda = Object.keys(td).filter((k) => ta[k] !== td[k]).map((k) => ({ campo: k, antes: ta[k], despues: td[k] }));
  }
  return {
    hay: true,
    borrador: p.borrador,
    cambios,
    tienda,
    fotos: p.archivos.filter((f) => f.endsWith(".webp")).length,
    historial: p.commits.map((m) => m.split("\n")[0]),
  };
}

async function publicar(persona: Awaited<ReturnType<typeof quienEs>>) {
  if (!persona.publica) throw new ErrorUsuario("Tu usuario puede editar pero no publicar. Pídele a quien publica que revise el borrador.", 403);
  const b = await borrador();
  if (!b.hay) throw new ErrorUsuario("No hay cambios pendientes para publicar.");
  const lineas = b.historial.map((h) => `- ${h}`).join("\n");
  const fecha = new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota" });
  const r = await gh().publicar(
    `Cambios del editor · ${fecha}`,
    `Publicado por ${persona.nombre} desde el editor.\n\n${lineas}`,
  );
  return { ...r, mensaje: "Publicado. La página se actualiza en uno o dos minutos." };
}

async function descartar(persona: Awaited<ReturnType<typeof quienEs>>) {
  if (!persona.publica) throw new ErrorUsuario("Solo quien publica puede descartar el borrador.", 403);
  await gh().descartar();
  return { mensaje: "Borrador descartado. Quedó igual a la página publicada." };
}

// ---------- Servidor ----------

Deno.serve(async (req) => {
  const h = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  const json = (datos: unknown, status = 200) =>
    new Response(JSON.stringify(datos), { status, headers: { ...h, "Content-Type": "application/json" } });
  try {
    if (req.method !== "POST") throw new ErrorUsuario("Método no permitido", 405);
    const persona = await quienEs(req);
    const cuerpo = await req.json().catch(() => ({}));
    switch (cuerpo.accion) {
      case "sesion": return json({ nombre: persona.nombre, email: persona.email, publica: persona.publica });
      case "chat": return json(await chat(cuerpo, persona));
      case "borrador": return json(await borrador());
      case "publicar": return json(await publicar(persona));
      case "descartar": return json(await descartar(persona));
      default: throw new ErrorUsuario("Acción desconocida");
    }
  } catch (e) {
    if (e instanceof ErrorUsuario) return json({ error: e.message }, e.status);
    console.error(e);
    const msg = e instanceof Anthropic.APIError
      ? "Claude no respondió. Intenta de nuevo en un momento."
      : "Algo falló en el servidor. Intenta de nuevo; si sigue, avísale a Juam.";
    return json({ error: msg }, 500);
  }
});
