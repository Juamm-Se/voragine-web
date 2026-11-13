# Editor Vorágine

Panel privado para que el equipo cambie el catálogo conversando con Claude, sin tocar código.
Queda en **voraginebyalttura.com/editor/**.

## Qué puede hacer

- Agregar, editar y quitar perfumes (nombre, marca, público, línea, familia, notas, descripción, precio).
- Poner o cambiar la foto de un perfume desde el celular o el computador.
- Cambiar los datos de la tienda: eslogan, WhatsApp, mensajes de cotización, envíos, Instagram y si se muestran precios.
- Responder preguntas sobre el catálogo ("¿qué perfumes no tienen foto?").

Todo lo que se cambia queda en la rama `borrador`. La página no cambia hasta que alguien autorizado
pulsa **Publicar**, que une el borrador a `main` con un pull request (y GitHub Pages publica solo).

## Cómo funciona

```
Panel (editor/ en GitHub Pages)
   │  inicio de sesión con Supabase Auth
   ▼
Servidor (supabase/functions/editor) ── Claude (API de Anthropic)
   │  guarda en un solo commit por mensaje
   ▼
GitHub: rama borrador ──(Publicar: pull request)──▶ main ──▶ voraginebyalttura.com
```

- `editor/` es la página del panel. `editor/config.js` lleva la dirección y la llave pública de Supabase.
- `supabase/functions/editor/` es el servidor. Las llaves secretas viven solo ahí.

## Puesta en marcha (una sola vez)

1. **Supabase.** Crear un proyecto (el plan gratis alcanza). En *Authentication → Sign In / Providers*
   desactivar "Allow new users to sign up", para que nadie se registre solo.
2. **Usuarios.** En *Authentication → Users → Add user* crear cada persona del equipo con correo y
   contraseña (marcar "Auto Confirm User"). Opcional: en *User metadata* poner `{"nombre": "Ana"}`.
3. **Token de GitHub.** En GitHub → Settings → Developer settings → *Fine-grained tokens*: acceso solo al
   repositorio `voragine-web`, permisos **Contents: Read and write** y **Pull requests: Read and write**.
4. **Llave de Claude.** En console.anthropic.com → API Keys. Conviene ponerle un límite de gasto mensual.
5. **Secretos y despliegue** (con la CLI de Supabase, desde la carpeta del repositorio):

   ```sh
   supabase link --project-ref <ref-del-proyecto>
   supabase secrets set ANTHROPIC_API_KEY=... GITHUB_TOKEN=... \
     GITHUB_REPO=juamm-se/voragine-web PUBLICADORES=correo1@...,correo2@...
   supabase functions deploy editor
   ```

6. **Conectar el panel.** Poner en `editor/config.js` la *Project URL* y la llave *anon/publishable*
   (Project Settings → API) y publicar ese cambio.

## Permisos

- Cualquier usuario creado en Supabase puede **editar** (sus cambios van al borrador).
- Solo los correos en `PUBLICADORES` pueden **publicar** o **descartar** el borrador.

## Ajustes opcionales (secretos)

| Secreto | Para qué | Por defecto |
|---|---|---|
| `MODELO` | Modelo de Claude | `claude-opus-5-5` |
| `ESFUERZO` | `low`, `medium` o `high`: más esfuerzo es más lento y costoso | `low` |
| `ORIGENES` | Dominios que pueden usar el servidor, separados por coma | `https://voraginebyalttura.com`, `https://www.voraginebyalttura.com`, `http://localhost:8000` |

## Probar en el computador

```sh
python3 -m http.server 8000   # desde la carpeta del repositorio
```

y abrir http://localhost:8000/editor/ (el servidor ya acepta ese origen).
