// The terrain of one world, as the mobs need it: which blocks are solid, where the ground is.
// A chunk is first generated from the seed (world.js, instantly), then replaced by what Supabase holds for
// it (the frozen terrain and every block a player changed), read with a connected player's own token, like
// the browser does. Changes made while the server plays arrive from the browsers (`edit`). Chunks nobody
// has needed for a while are forgotten.
import { World, Mesh } from './shared.js';

const { CH, SY, li, ckey, genChunk, decodeChunk } = World;
const FORGET_MS = 5 * 60000,
  REFRESH_MS = 3 * 60000, // read again from Supabase now and then: an edit a browser didn't pass on
  PAGE = 1000;

// read a box of chunks from Supabase's REST API: their frozen terrain and the blocks changed there
export async function supabaseArea(cfg, token, world, cx0, cz0, cx1, cz1) {
  const h = { apikey: cfg.anonKey, Authorization: 'Bearer ' + token },
    base = `${cfg.supabaseUrl}/rest/v1`,
    w = `world=eq.${encodeURIComponent(world)}`;
  async function all(path) {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const r = await fetch(`${base}/${path}&limit=${PAGE}&offset=${from}`, { headers: h });
      if (!r.ok) throw new Error(`${path.split('?')[0]}: ${r.status}`);
      const page = await r.json();
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  }
  const [chunks, edits] = await Promise.all([
    all(`chunks?select=cx,cz,sy,data&${w}&cx=gte.${cx0}&cx=lte.${cx1}&cz=gte.${cz0}&cz=lte.${cz1}&order=cx,cz`),
    all(`blocks?select=x,y,z,id&${w}&x=gte.${cx0 * CH}&x=lt.${(cx1 + 1) * CH}&z=gte.${cz0 * CH}&z=lt.${(cz1 + 1) * CH}&order=x,y,z`),
  ]);
  return { chunks, edits };
}

export function createTerrain(fetchArea, log = () => {}) {
  const chunks = new Map(), // key -> { a: Uint8Array, used, fetched, busy }
    recent = new Map(); // "x,y,z" -> { id, at }: edits seen lately, laid again over a fresh read
  function set(c, x, y, z, id) {
    if (y < 0 || y >= SY) return;
    c.a[li(x - Math.floor(x / CH) * CH, y, z - Math.floor(z / CH) * CH)] = id;
  }
  // reads go in batches: the chunks asked for within a moment are read as one box (or a few)
  const queue = new Set();
  let flushing = null;
  function want(k) {
    queue.add(k);
    if (!flushing) flushing = setTimeout(flush, 100);
  }
  async function flush() {
    const keys = [...queue];
    queue.clear();
    flushing = null;
    const cs = keys.map(k => k.split(',').map(Number));
    const boxes = [];
    // one box around them all when it's compact (a player's surroundings), otherwise one per chunk
    const xs = cs.map(c => c[0]),
      zs = cs.map(c => c[1]),
      bx0 = Math.min(...xs),
      bx1 = Math.max(...xs),
      bz0 = Math.min(...zs),
      bz1 = Math.max(...zs);
    if ((bx1 - bx0 + 1) * (bz1 - bz0 + 1) <= 49) boxes.push([bx0, bz0, bx1, bz1, cs]);
    else for (const c of cs) boxes.push([c[0], c[1], c[0], c[1], [c]]);
    await Promise.all(boxes.map(b => readBox(...b)));
  }
  async function readBox(cx0, cz0, cx1, cz1, cs) {
    const mine = cs.map(([cx, cz]) => [cx, cz, chunks.get(ckey(cx, cz))]).filter(([, , c]) => c);
    let r = null;
    try {
      r = await fetchArea(cx0, cz0, cx1, cz1);
    } catch (e) {
      log(`terrain ${cx0},${cz0}..${cx1},${cz1}: ${e.message}`);
    }
    for (const [cx, cz, c] of mine) {
      c.busy = false;
      if (!r) {
        c.fetched = Date.now() - REFRESH_MS + 20000; // try again in 20 s
        continue;
      }
      const row = r.chunks.find(x => x.cx === cx && x.cz === cz),
        a = row ? decodeChunk(row.data, row.sy) : genChunk(cx, cz),
        mineOf = (x, z) => Math.floor(x / CH) === cx && Math.floor(z / CH) === cz;
      for (const e of r.edits) if (mineOf(e.x, e.z)) set({ a }, e.x, e.y, e.z, e.id);
      for (const [key, e] of recent) {
        const [x, y, z] = key.split(',').map(Number);
        if (mineOf(x, z)) set({ a }, x, y, z, e.id);
      }
      c.a = a;
      c.fetched = Date.now();
    }
  }
  function fetchChunk(k) {
    const c = chunks.get(k);
    if (!c || c.busy) return;
    c.busy = true;
    want(k);
  }
  // the chunk, generated at once if it's new (its real terrain follows from Supabase)
  function chunk(cx, cz) {
    const k = ckey(cx, cz);
    let c = chunks.get(k);
    if (!c) {
      c = { a: genChunk(cx, cz), used: Date.now(), fetched: 0, busy: false };
      chunks.set(k, c);
    }
    c.used = Date.now();
    if (Date.now() - c.fetched > REFRESH_MS) fetchChunk(k);
    return c;
  }
  const get = (x, y, z) => {
    if (y < 0 || y >= SY) return 0;
    const cx = Math.floor(x / CH),
      cz = Math.floor(z / CH);
    return chunk(cx, cz).a[li(x - cx * CH, y, z - cz * CH)];
  };
  return {
    get,
    isSolid: Mesh.isSolid,
    isCross: Mesh.isCross,
    chunk,
    // a block a browser saw change (Supabase's own feed): laid at once
    edit(x, y, z, id) {
      if (![x, y, z, id].every(Number.isInteger) || y < 0 || y >= SY) return;
      const c = chunks.get(ckey(Math.floor(x / CH), Math.floor(z / CH)));
      if (c) set(c, x, y, z, id);
      recent.set(`${x},${y},${z}`, { id, at: Date.now() });
    },
    // the chunks around (cx, cz), r chunks out, nearest first; at most `budget` new ones generated per call
    // (about 10 ms each: a player arriving somewhere new doesn't freeze everyone else's game)
    around(cx, cz, r, budget = 3) {
      for (let ring = 0; ring <= r; ring++)
        for (let dz = -ring; dz <= ring; dz++)
          for (let dx = -ring; dx <= ring; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
            const k = ckey(cx + dx, cz + dz);
            if (!chunks.has(k)) {
              if (budget <= 0) continue;
              budget--;
            }
            chunk(cx + dx, cz + dz);
          }
      return budget;
    },
    close() {
      clearTimeout(flushing);
    },
    prune() {
      const now = Date.now();
      for (const [k, c] of chunks) if (now - c.used > FORGET_MS) chunks.delete(k);
      for (const [k, e] of recent) if (now - e.at > REFRESH_MS * 2) recent.delete(k);
    },
    has: (cx, cz) => chunks.has(ckey(cx, cz)),
    ready: (cx, cz) => (chunks.get(ckey(cx, cz))?.fetched || 0) > 0,
    size: () => chunks.size,
  };
}
