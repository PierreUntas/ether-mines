// Chunk meshing: turns a chunk's blocks into triangles (positions, normals, UV, shading).
// Pure function, shared by the page (fallback) and by the src/mesh-worker.js worker (background).
// Script with no import or export: loaded via <script> or importScripts.
(function (root) {
  'use strict';
  const B = root.Rules.B,
    { SY, CH, li } = root.World,
    AN = 16; // tiles per side of the atlas
  const lerp = (a, b, t) => a + (b - a) * t,
    coordKey = (x, y, z) => x + ',' + y + ',' + z;
  const isCross = id => B[id] && B[id].x != null;
  const isTransp = id => id === 0 || id === 11 || isCross(id) || !B[id] || !!(B[id].leaf || B[id].glass || B[id].shape);
  const isSolid = id => !!(id && id !== 11 && B[id] && !isCross(id) && !B[id].pass);
  const isOpaque = id => id && !isTransp(id);
  const isShaped = id => !!(B[id] && B[id].shape);
  const STAIR_HI = [
    [0, 0.5, 0, 1, 1, 0.5],
    [0, 0.5, 0, 0.5, 1, 1],
    [0, 0.5, 0.5, 1, 1, 1],
    [0.5, 0.5, 0, 1, 1, 1],
  ]; // upper part on the facing side: 0 → -z, 1 → -x, 2 → +z, 3 → +x
  const DOORB = [
    [0, 0, 0, 1, 1, 0.1875],
    [0, 0, 0, 0.1875, 1, 1],
    [0, 0, 0.8125, 1, 1, 1],
    [0.8125, 0, 0, 1, 1, 1],
  ];
  const doorOpen = (id, key, pw) => !!(B[id].open || pw(key));
  // neighbors for fences and panes: [dx, dz] in the order +x, -x, +z, -z
  const SIDES = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const LADDER = [
    [0, 0, 0, 1, 1, 0.125],
    [0, 0, 0, 0.125, 1, 1],
    [0, 0, 0.875, 1, 1, 1],
    [0.875, 0, 0, 1, 1, 1],
  ];
  // bed: an inset mattress plus a board at the outer edge, facing 0 → -z, 1 → -x, 2 → +z, 3 → +x
  // (the direction from the foot toward the head); the footboard sits at the opposite edge from the head.
  const MATTRESS = [0.04, 0, 0.04, 0.96, 0.3, 0.96];
  const FOOTBOARD = [
    [0, 0, 0.86, 1, 0.32, 1],
    [0.86, 0, 0, 1, 0.32, 1],
    [0, 0, 0, 1, 0.32, 0.14],
    [0, 0, 0, 0.14, 0.32, 1],
  ];
  const HEADBOARD = [
    [0, 0, 0, 1, 0.65, 0.14],
    [0, 0, 0, 0.14, 0.65, 1],
    [0, 0, 0.86, 1, 0.65, 1],
    [0.86, 0, 0, 1, 0.65, 1],
  ];
  const PILLOW = [
    [0.28, 0.3, 0.16, 0.72, 0.44, 0.42],
    [0.16, 0.3, 0.28, 0.42, 0.44, 0.72],
    [0.28, 0.3, 0.58, 0.72, 0.44, 0.84],
    [0.58, 0.3, 0.28, 0.84, 0.44, 0.72],
  ];
  // an arm from a to b (from 0.5 toward the edge) on the given side
  const arm = (c, a, b, y0, y1) =>
    c === 0
      ? [0.5 + a, y0, 0.5 - b, 1, y1, 0.5 + b]
      : c === 1
        ? [0, y0, 0.5 - b, 0.5 - a, y1, 0.5 + b]
        : c === 2
          ? [0.5 - b, y0, 0.5 + a, 0.5 + b, y1, 1]
          : [0.5 - b, y0, 0, 0.5 + b, y1, 0.5 - a];
  // get (optional): block of the world, to connect fences and panes to their neighbors
  function shapeBoxes(id, key, pw, get) {
    const b = B[id];
    const connects = test => {
      if (!get) return [];
      const [x, y, z] = key.split(',').map(Number);
      return SIDES.map(([dx, dz], c) => (test(get(x + dx, y, z + dz)) ? c : -1)).filter(c => c >= 0);
    };
    if (b.shape && b.shape.startsWith('bed')) {
      const f = +b.shape[3],
        half = b.shape[4];
      return half === 'f' ? [MATTRESS, FOOTBOARD[f]] : [MATTRESS, HEADBOARD[f], PILLOW[f]];
    }
    switch (b.shape) {
      case 'table':
        return [
          [0, 0, 0, 1, 0.5, 1], // tabletop
          [0.52, 0.5, 0.52, 0.82, 0.57, 0.82], // plate
          [0.2, 0.5, 0.2, 0.32, 0.82, 0.32], // glass
        ];
      case 'fence': {
        const out = [[0.375, 0, 0.375, 0.625, 1, 0.625]];
        for (const c of connects(n => isOpaque(n) || (B[n] && B[n].shape === 'fence')))
          out.push(arm(c, 0.125, 0.0625, 0.375, 0.5625), arm(c, 0.125, 0.0625, 0.75, 0.9375));
        return out;
      }
      case 'pane': {
        let c = connects(n => isOpaque(n) || (B[n] && (B[n].shape === 'pane' || B[n].glass)));
        if (!c.length) c = [0, 1]; // alone: a straight pane
        return [[0.4375, 0, 0.4375, 0.5625, 1, 0.5625], ...c.map(k => arm(k, 0.0625, 0.0625, 0, 1))];
      }
      case 'ladder':
        return [LADDER[b.o]];
      case 'slab':
        return [[0, 0, 0, 1, 0.5, 1]];
      case 'stairs':
        return [[0, 0, 0, 1, 0.5, 1], STAIR_HI[b.o]];
      case 'door':
        return [DOORB[doorOpen(id, key, pw) ? (b.f + 1) % 4 : b.f]];
      case 'plate':
        return [[0.06, 0, 0.06, 0.94, pw(key) ? 0.03 : 0.06, 0.94]];
      case 'cable':
        return [[0, 0, 0, 1, 0.03, 1]];
      case 'lever':
        return [[0.3, 0, 0.3, 0.7, 0.12, 0.7], b.on ? [0.54, 0.1, 0.46, 0.62, 0.58, 0.54] : [0.38, 0.1, 0.46, 0.46, 0.58, 0.54]];
      default:
        return [[0, 0, 0, 1, 1, 1]];
    }
  }
  const FACES = [
    {
      n: [1, 0, 0],
      a: 0,
      c: [
        [1, 0, 0],
        [1, 1, 0],
        [1, 1, 1],
        [1, 0, 1],
      ],
      s: 1,
    },
    {
      n: [-1, 0, 0],
      a: 0,
      c: [
        [0, 0, 1],
        [0, 1, 1],
        [0, 1, 0],
        [0, 0, 0],
      ],
      s: 1,
    },
    {
      n: [0, 1, 0],
      a: 1,
      c: [
        [0, 1, 1],
        [1, 1, 1],
        [1, 1, 0],
        [0, 1, 0],
      ],
      s: 0,
    },
    {
      n: [0, -1, 0],
      a: 1,
      c: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
        [0, 0, 1],
      ],
      s: 2,
    },
    {
      n: [0, 0, 1],
      a: 2,
      c: [
        [1, 0, 1],
        [1, 1, 1],
        [0, 1, 1],
        [0, 0, 1],
      ],
      s: 1,
    },
    {
      n: [0, 0, -1],
      a: 2,
      c: [
        [0, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
        [1, 0, 0],
      ],
      s: 1,
    },
  ];
  const AOF = [0.36, 0.58, 0.8, 1];
  // per-face shading, like in Minecraft: block edges stay readable even under a vertical sun
  const faceShade = n => (n[1] > 0 ? 1 : n[1] < 0 ? 0.6 : n[0] !== 0 ? 0.8 : 0.9);
  function uvRect(ti) {
    const tx = ti % AN,
      ty = Math.floor(ti / AN),
      e = 0.0008;
    return [tx / AN + e, (tx + 1) / AN - e, 1 - (ty + 1) / AN + e, 1 - ty / AN - e];
  }
  // get(x, y, z): block of the world; pw(key): powered block. Returns four groups (opaque, glass, water, plants).
  function meshChunk(cx, cz, get, pw) {
    const arr = new Uint8Array(CH * CH * SY);
    for (let y = 0; y < SY; y++)
      for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++) arr[li(x, y, z)] = get(cx * CH + x, y, cz * CH + z);
    const A = { op: [[], [], [], [], []], gl: [[], [], [], [], []], wa: [[], [], [], []], pl: [[], [], [], []] }; // pos,nor,uv,col,idx
    const pushQ = (G, pts, nor, uvs, cols, flipTri) => {
      const base = G[0].length / 3,
        sh = faceShade(nor);
      for (let k = 0; k < 4; k++) {
        G[0].push(...pts[k]);
        G[1].push(...nor);
        G[2].push(...uvs[k]);
        if (cols) {
          const c = cols[k] * sh;
          G[3].push(c, c, c);
        }
      }
      const ix = cols ? G[4] : G[3];
      if (flipTri) ix.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      else ix.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    // an arbitrary box within a block (slab, stair, door…): faces hidden only against a solid opaque block
    const emitBox = (G, x, y, z, bb, tt, big) => {
      const [x0, y0, z0, x1, y1, z1] = bb,
        thin = x1 - x0 < 0.3 ? 0 : z1 - z0 < 0.3 ? 2 : -1;
      for (const f of FACES) {
        const edge =
          (f.n[0] > 0 && x1 === 1) ||
          (f.n[0] < 0 && x0 === 0) ||
          (f.n[1] > 0 && y1 === 1) ||
          (f.n[1] < 0 && y0 === 0) ||
          (f.n[2] > 0 && z1 === 1) ||
          (f.n[2] < 0 && z0 === 0);
        if (edge && isOpaque(get(x + f.n[0], y + f.n[1], z + f.n[2]))) continue;
        const [u0, u1, v0, v1] = uvRect(big != null && f.a === thin ? big : tt[f.s]),
          pts = [],
          uvs = [];
        for (const c of f.c) {
          const px = c[0] ? x1 : x0,
            py = c[1] ? y1 : y0,
            pz = c[2] ? z1 : z0;
          pts.push([x + px, y + py, z + pz]);
          let uu, vv;
          if (f.a === 1) {
            uu = px;
            vv = pz;
          } else if (f.a === 0) {
            uu = f.n[0] > 0 ? 1 - pz : pz;
            vv = py;
          } else {
            uu = f.n[2] > 0 ? px : 1 - px;
            vv = py;
          }
          uvs.push([lerp(u0, u1, uu), lerp(v0, v1, vv)]);
        }
        pushQ(G, pts, f.n, uvs, [1, 1, 1, 1], false);
      }
    };
    for (let y = 0; y < SY; y++)
      for (let z = cz * CH; z < cz * CH + CH; z++)
        for (let x = cx * CH; x < cx * CH + CH; x++) {
          const id = arr[li(x - cx * CH, y, z - cz * CH)];
          if (!id) continue;
          const b = B[id];
          if (!b) continue;
          if (b.x != null) {
            const [u0, u1, v0, v1] = uvRect(b.x),
              o = 0.15;
            for (const [p, q] of [
              [
                [x + o, z + o],
                [x + 1 - o, z + 1 - o],
              ],
              [
                [x + 1 - o, z + o],
                [x + o, z + 1 - o],
              ],
            ])
              pushQ(
                A.pl,
                [
                  [p[0], y, p[1]],
                  [p[0], y + 0.999, p[1]], // top vertices barely lower: the shader recognizes them and makes them sway in the wind
                  [q[0], y + 0.999, q[1]],
                  [q[0], y, q[1]],
                ],
                [0, 1, 0],
                [
                  [u0, v0],
                  [u0, v1],
                  [u1, v1],
                  [u1, v0],
                ],
                null,
                false,
              );
            continue;
          }
          if (b.water) {
            for (const f of FACES) {
              const nb = get(x + f.n[0], y + f.n[1], z + f.n[2]);
              if (nb === 11 || (isSolid(nb) && !B[nb].leaf && !B[nb].glass)) continue;
              if (f.n[1] < 0) continue;
              const top = get(x, y + 1, z) !== 11 ? 0.86 : 1;
              const pts = f.c.map(c => [x + c[0], y + (c[1] ? top : 0), z + c[2]]);
              const uvs = pts.map(p =>
                f.a === 1 ? [p[0] * 0.25, p[2] * 0.25] : f.a === 0 ? [p[2] * 0.25, p[1] * 0.25] : [p[0] * 0.25, p[1] * 0.25],
              );
              pushQ(A.wa, pts, f.n, uvs, null, false);
            }
            continue;
          }
          if (b.shape) {
            const key = coordKey(x, y, z),
              on = pw(key);
            shapeBoxes(id, key, pw, get).forEach((bb, bi) =>
              emitBox(
                b.shape === 'pane' ? A.gl : A.op, // pane: translucent glass
                x,
                y,
                z,
                bb,
                b.shape === 'cable'
                  ? on
                    ? [44, 44, 44]
                    : [43, 43, 43]
                  : b.shape === 'lever' && bi === 1
                    ? [10, 10, 10]
                    : b.shape === 'table' && bi === 1
                      ? [127, 127, 127]
                      : b.shape === 'table' && bi === 2
                        ? [126, 126, 126]
                        : b.shape && b.shape.startsWith('bed') && bi === 1
                          ? [10, 10, 10]
                          : b.shape && b.shape.startsWith('bed') && bi === 2
                            ? [125, 125, 125]
                            : b.t,
                b.shape === 'door' ? (b.top ? 40 : 39) : null,
              ),
            );
            if (b.shape === 'lever' && b.on) emitBox(A.op, x, y, z, [0.54, 0.52, 0.46, 0.62, 0.6, 0.54], [46, 46, 46], null);
            continue;
          }
          const G = b.glass ? A.gl : A.op,
            lit = (id === 68 || b.tOn) && pw(coordKey(x, y, z)); // lamp lit, logic gate active
          for (const f of FACES) {
            const nx = x + f.n[0],
              ny = y + f.n[1],
              nz = z + f.n[2],
              nb = get(nx, ny, nz);
            if (ny < 0) continue;
            if (isOpaque(nb)) continue;
            if (nb === id && (b.leaf || b.glass)) continue;
            const [u0, u1, v0, v1] = uvRect(lit ? (b.tOn ? b.tOn[f.s] : 46) : b.t[f.s]);
            const u = (f.a + 1) % 3,
              w = (f.a + 2) % 3,
              ao = [],
              pts = [],
              uvs = [];
            for (const c of f.c) {
              const p = [nx, ny, nz],
                du = c[u] ? 1 : -1,
                dw = c[w] ? 1 : -1;
              const p1 = p.slice();
              p1[u] += du;
              const p2 = p.slice();
              p2[w] += dw;
              const p3 = p1.slice();
              p3[w] += dw;
              const s1 = isOpaque(get(...p1)) ? 1 : 0,
                s2 = isOpaque(get(...p2)) ? 1 : 0,
                s3 = isOpaque(get(...p3)) ? 1 : 0;
              ao.push(s1 && s2 ? 0 : 3 - (s1 + s2 + s3));
              pts.push([x + c[0], y + c[1], z + c[2]]);
              let uu, vv;
              if (f.a === 1) {
                uu = c[0];
                vv = c[2];
              } else if (f.a === 0) {
                uu = f.n[0] > 0 ? 1 - c[2] : c[2];
                vv = c[1];
              } else {
                uu = f.n[2] > 0 ? c[0] : 1 - c[0];
                vv = c[1];
              }
              uvs.push([lerp(u0, u1, uu), lerp(v0, v1, vv)]);
            }
            pushQ(
              G,
              pts,
              f.n,
              uvs,
              ao.map(a => AOF[a]),
              ao[0] + ao[2] < ao[1] + ao[3],
            );
          }
        }
    return A;
  }
  // Groups → typed arrays, transferable from one thread to another without copying.
  function pack(A) {
    const one = (G, col) =>
      G[0].length
        ? {
            pos: new Float32Array(G[0]),
            nor: new Float32Array(G[1]),
            uv: new Float32Array(G[2]),
            col: col ? new Float32Array(G[3]) : null,
            idx: new Uint32Array(col ? G[4] : G[3]),
          }
        : null;
    return { op: one(A.op, true), gl: one(A.gl, true), wa: one(A.wa, false), pl: one(A.pl, false) };
  }
  const buffers = M =>
    Object.values(M)
      .filter(Boolean)
      .flatMap(g => [g.pos.buffer, g.nor.buffer, g.uv.buffer, g.idx.buffer].concat(g.col ? [g.col.buffer] : []));
  root.Mesh = {
    FACES,
    AOF,
    STAIR_HI,
    DOORB,
    uvRect,
    isCross,
    isTransp,
    isSolid,
    isOpaque,
    isShaped,
    shapeBoxes,
    meshChunk,
    pack,
    buffers,
  };
})(globalThis);
