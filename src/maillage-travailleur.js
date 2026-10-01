// Travailleur de maillage : calcule les triangles d'un tronçon hors du fil principal, pour éviter les saccades.
importScripts('../supabase/functions/_shared/world.js', '../supabase/functions/_shared/rules.js', 'maillage.js');
const { SY, CH, li } = World;
onmessage = e => {
  const { id, cx, cz, chunks, powered } = e.data,
    pw = new Set(powered);
  const get = (x, y, z) => {
    if (y < 0 || y >= SY) return 0;
    const kx = Math.floor(x / CH),
      kz = Math.floor(z / CH),
      c = chunks[kx + ',' + kz];
    return c ? c[li(x - kx * CH, y, z - kz * CH)] : 0;
  };
  const mesh = Maillage.pack(Maillage.meshChunk(cx, cz, get, k => pw.has(k)));
  postMessage({ id, cx, cz, mesh }, Maillage.buffers(mesh));
};
