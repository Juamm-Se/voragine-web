/* ============================================================
   CONEXIÓN DEL EDITOR
   Datos públicos del proyecto de Supabase (Project Settings → API).
   La llave "anon" es pública por diseño: no da acceso a nada sin
   iniciar sesión. Las llaves secretas viven solo en el servidor.
   ============================================================ */
window.EDITOR = {
  supabaseUrl: "",      // ej. "https://abcdefghijkl.supabase.co"
  supabaseAnonKey: ""   // ej. "eyJhbGciOi..."
};
