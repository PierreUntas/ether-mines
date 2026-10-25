// Mesh worker: computes a chunk's triangles off the main thread, to avoid stutter.
importScripts('../supabase/functions/_shared/world.js', '../supabase/functions/_shared/rules.js', 'mesh.js');
const { SY, CH, li } = World;
onmessage = e => {
  const { id, cx, cz, chunks, powered, hidden } = e.data,
    pw = new Set(powered),
    hide = new Set(hidden || []); // blocks being animated (22-gestures.js): meshed as air meanwhile
  const get = (x, y, z) => {
    if (y < 0 || y >= SY) return 0;
    if (hide.size && hide.has(x + ',' + y + ',' + z)) return 0;
    const kx = Math.floor(x / CH),
      kz = Math.floor(z / CH),
      c = chunks[kx + ',' + kz];
    return c ? c[li(x - kx * CH, y, z - kz * CH)] : 0;
  };
  // an error on one chunk must not kill the worker: send it back, the game meshes that chunk in place
  let mesh;
  try {
    mesh = Mesh.pack(Mesh.meshChunk(cx, cz, get, k => pw.has(k)));
  } catch (err) {
    postMessage({ id, cx, cz, err: String((err && err.message) || err) });
    return;
  }
  postMessage({ id, cx, cz, mesh }, Mesh.buffers(mesh));
};
