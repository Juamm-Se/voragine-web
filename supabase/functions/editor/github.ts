// Acceso a GitHub: leer archivos del borrador, guardar cambios en un solo
// commit y publicar el borrador en main con un pull request.

export interface ArchivoNuevo {
  ruta: string;
  texto?: string; // contenido de texto (UTF-8)
  base64?: string; // contenido binario (fotos)
}

export class GitHub {
  constructor(
    private token: string,
    private repo: string, // "dueño/nombre"
    readonly publicada = "main",
    readonly borrador = "borrador",
  ) {}

  private async api(ruta: string, init: RequestInit = {}, aceptar = "application/vnd.github+json") {
    const r = await fetch(`https://api.github.com/repos/${this.repo}${ruta}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: aceptar,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "editor-voragine",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!r.ok) {
      const cuerpo = await r.text();
      const e = new Error(`GitHub ${r.status} en ${ruta}: ${cuerpo.slice(0, 300)}`) as Error & { status: number };
      e.status = r.status;
      throw e;
    }
    return aceptar.includes("raw") ? r.text() : r.status === 204 ? null : r.json();
  }

  async shaDe(rama: string): Promise<string | null> {
    try {
      const ref = await this.api(`/git/ref/heads/${rama}`);
      return ref.object.sha;
    } catch (e) {
      if ((e as { status?: number }).status === 404) return null;
      throw e;
    }
  }

  // Deja el borrador listo para recibir cambios y devuelve su commit actual.
  // Si no existe, lo crea desde main. Si no tiene nada pendiente, lo pone al
  // día con main (por si alguien publicó otra cosa entretanto).
  async prepararBorrador(): Promise<string> {
    const main = await this.shaDe(this.publicada);
    if (!main) throw new Error(`No existe la rama ${this.publicada}`);
    const actual = await this.shaDe(this.borrador);
    if (!actual) {
      await this.api(`/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${this.borrador}`, sha: main }) });
      return main;
    }
    if (actual === main) return main;
    const cmp = await this.api(`/compare/${this.publicada}...${this.borrador}`);
    if (cmp.ahead_by === 0) {
      await this.api(`/git/refs/heads/${this.borrador}`, { method: "PATCH", body: JSON.stringify({ sha: main, force: true }) });
      return main;
    }
    return actual;
  }

  leer(ruta: string, ref: string): Promise<string> {
    return this.api(`/contents/${encodeURI(ruta)}?ref=${ref}`, {}, "application/vnd.github.raw+json");
  }

  // Un solo commit con todos los archivos. Falla (409/422) si alguien más
  // guardó en el borrador desde que lo leímos, en vez de pisar su trabajo.
  async guardar(base: string, archivos: ArchivoNuevo[], mensaje: string, autor?: { name: string; email: string }) {
    const commitBase = await this.api(`/git/commits/${base}`);
    const arbol = [];
    for (const a of archivos) {
      const blob = await this.api(`/git/blobs`, {
        method: "POST",
        body: JSON.stringify(a.base64 !== undefined ? { content: a.base64, encoding: "base64" } : { content: a.texto, encoding: "utf-8" }),
      });
      arbol.push({ path: a.ruta, mode: "100644", type: "blob", sha: blob.sha });
    }
    const tree = await this.api(`/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: commitBase.tree.sha, tree: arbol }) });
    const commit = await this.api(`/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message: mensaje, tree: tree.sha, parents: [base], ...(autor ? { author: autor } : {}) }),
    });
    await this.api(`/git/refs/heads/${this.borrador}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
    return commit.sha as string;
  }

  async pendientes() {
    const main = await this.shaDe(this.publicada);
    const borr = await this.shaDe(this.borrador);
    if (!borr || borr === main) return { main, borrador: borr, commits: [] as string[], archivos: [] as string[] };
    const cmp = await this.api(`/compare/${this.publicada}...${this.borrador}`);
    return {
      main,
      borrador: borr,
      commits: (cmp.commits as { commit: { message: string } }[]).map((c) => c.commit.message),
      archivos: ((cmp.files ?? []) as { filename: string }[]).map((f) => f.filename),
      atrasado: cmp.behind_by as number,
    };
  }

  async publicar(titulo: string, cuerpo: string): Promise<{ numero: number; url: string }> {
    const [dueno] = this.repo.split("/");
    const abiertos = await this.api(`/pulls?state=open&head=${dueno}:${this.borrador}&base=${this.publicada}`);
    const pr = abiertos[0] ?? await this.api(`/pulls`, {
      method: "POST",
      body: JSON.stringify({ title: titulo, body: cuerpo, head: this.borrador, base: this.publicada }),
    });
    // "merge" (no squash): así el borrador queda contenido en main y se reinicia limpio.
    await this.api(`/pulls/${pr.number}/merge`, { method: "PUT", body: JSON.stringify({ merge_method: "merge", commit_title: `${titulo} (#${pr.number})` }) });
    return { numero: pr.number, url: pr.html_url };
  }

  async descartar() {
    const main = await this.shaDe(this.publicada);
    await this.api(`/git/refs/heads/${this.borrador}`, { method: "PATCH", body: JSON.stringify({ sha: main, force: true }) });
  }
}
