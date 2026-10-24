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
      case 'plate': {
        // a pressure plate (66) stands noticeably proud of the floor so it's easy to spot and aim for;
        // a lily pad (77) stays a flat film on the water surface, unchanged
        const hi = id === 66 ? 0.16 : 0.06;
        return [[0.06, 0, 0.06, 0.94, pw(key) ? hi * 0.5 : hi, 0.94]];
      }
      case 'cable':
        return [[0, 0, 0, 1, 0.03, 1]];
      case 'furn': // furniture and signs (rules.js): the block's own boxes
        return b.boxes;
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
  // the clay look's rounded outer edges: how far in the round starts (a block = 1), and tan(22.5°), the
  // middle step of each quarter round
  // the steps of each quarter round (0 → 1: the face, then the half-way line around the edge): one, its
  // normals smooth across it so the light rounds it (fewer triangles: phones draw a lot of land)
  const ROUND = 0.18,
    ROUND_STEPS = [0, 1];
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
    const A = { op: [[], [], [], [], [], []], gl: [[], [], [], [], [], []], wa: [[], [], [], []], pl: [[], [], [], []] }; // pos,nor,uv,col,idx,edge
    // edge (shaded groups): which of the face's four sides are an outer edge of the land (bits: the face's
    // u = 0, u = 1, v = 0, v = 1 sides), for the clay look's rounded edges; 0 for anything but a full block
    const pushQ = (G, pts, nor, uvs, cols, flipTri, edge = 0) => {
      const base = G[0].length / 3,
        sh = faceShade(nor);
      for (let k = 0; k < 4; k++) {
        G[0].push(...pts[k]);
        G[1].push(...nor);
        G[2].push(...uvs[k]);
        if (cols) {
          const c = cols[k] * sh;
          G[3].push(c, c, c);
          G[5].push(edge);
        }
      }
      const ix = cols ? G[4] : G[3];
      if (flipTri) ix.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      else ix.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    // a full block's face with rounded outer edges (the clay look's soft land): the face shrinks by ROUND on
    // each outer side, and a quarter round reaches from there to the half-way line around the edge, where
    // the next face's own quarter round meets it; where two outer sides meet, a corner of a sphere closes
    // it. Points on a round: its centre (ROUND inside the block) plus ROUND along normalize(n + a·u + b·v),
    // a and b going 0 → 1 (ROUND_STEPS), so the rounds of neighbouring faces share their points exactly.
    // The normals follow the round (the light rounds it); the shade baked into the colour follows the
    // normal (faceShade's mix), the AO the face's corners.
    const rounded = (G, n, pts, fuv, tile, ao, flip, edge) => {
      const r = ROUND;
      // the face's frame: O at (uu, vv) = (0, 0), U and V the world directions of uu and vv
      let O, Pu, Pv;
      for (let k = 0; k < 4; k++) {
        if (fuv[k][0] === 0 && fuv[k][1] === 0) O = pts[k];
        else if (fuv[k][0] === 1 && fuv[k][1] === 0) Pu = pts[k];
        else if (fuv[k][0] === 0 && fuv[k][1] === 1) Pv = pts[k];
      }
      const U = [Pu[0] - O[0], Pu[1] - O[1], Pu[2] - O[2]],
        V = [Pv[0] - O[0], Pv[1] - O[1], Pv[2] - O[2]];
      const at = (uu, vv) => [O[0] + U[0] * uu + V[0] * vv, O[1] + U[1] * uu + V[1] * vv, O[2] + U[2] * uu + V[2] * vv];
      // the AO at a point of the face: the corners' values, bilinear
      const aoAt = (uu, vv) => {
        let s = 0;
        for (let k = 0; k < 4; k++) s += ao[k] * (fuv[k][0] ? uu : 1 - uu) * (fuv[k][1] ? vv : 1 - vv);
        return s;
      };
      const base = () => G[0].length / 3;
      const vert = (p, d, uu, vv) => {
        G[0].push(p[0], p[1], p[2]);
        G[1].push(d[0], d[1], d[2]);
        G[2].push(lerp(tile[0], tile[1], uu), lerp(tile[2], tile[3], vv));
        const c = aoAt(uu, vv) * (d[0] * d[0] * 0.8 + d[2] * d[2] * 0.9 + d[1] * d[1] * (d[1] > 0 ? 1 : 0.6));
        G[3].push(c, c, c);
        G[5].push(edge);
      };
      // a quad of four vertices just pushed (b0..b0+3), turned to face outward along d
      const quad = (b0, d) => {
        const p = i => [G[0][(b0 + i) * 3], G[0][(b0 + i) * 3 + 1], G[0][(b0 + i) * 3 + 2]];
        const p0 = p(0),
          p1 = p(1),
          p2 = p(2),
          e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]],
          e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
        const cx = e1[1] * e2[2] - e1[2] * e2[1],
          cy = e1[2] * e2[0] - e1[0] * e2[2],
          cz = e1[0] * e2[1] - e1[1] * e2[0];
        if (cx * d[0] + cy * d[1] + cz * d[2] >= 0) G[4].push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
        else G[4].push(b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2);
      };
      const norm = v => {
        const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        return [v[0] / l, v[1] / l, v[2] / l];
      };
      const ou0 = edge & 1,
        ou1 = (edge >> 1) & 1,
        ov0 = (edge >> 2) & 1,
        ov1 = (edge >> 3) & 1;
      const iu0 = ou0 ? r : 0,
        iu1 = ou1 ? 1 - r : 1,
        iv0 = ov0 ? r : 0,
        iv1 = ov1 ? 1 - r : 1;
      // the flat middle, its corners in the face's own order (so its AO split stays the face's)
      let b0 = base();
      for (let k = 0; k < 4; k++) {
        const uu = fuv[k][0] ? iu1 : iu0,
          vv = fuv[k][1] ? iv1 : iv0;
        vert(at(uu, vv), n, uu, vv);
      }
      if (flip) G[4].push(b0 + 1, b0 + 2, b0 + 3, b0 + 1, b0 + 3, b0);
      else G[4].push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
      const A3 = ROUND_STEPS;
      // a round along one side: s = ±1 the side's direction along axis W (U or V), running along the other
      // axis from t0 to t1
      const strip = (alongU, s, t0, t1) => {
        const W = alongU ? U : V;
        for (let i = 0; i < A3.length - 1; i++) {
          const a0 = A3[i],
            a1 = A3[i + 1];
          b0 = base();
          for (const [a, t] of [
            [a0, t0],
            [a1, t0],
            [a1, t1],
            [a0, t1],
          ]) {
            const e = s > 0 ? 1 - r + r * a : r - r * a; // the face coordinate across the round
            const uu = alongU ? e : t,
              vv = alongU ? t : e;
            const cIn = alongU ? at(s > 0 ? 1 - r : r, t) : at(t, s > 0 ? 1 - r : r);
            const d = norm([n[0] + s * a * W[0], n[1] + s * a * W[1], n[2] + s * a * W[2]]);
            vert([cIn[0] - n[0] * r + d[0] * r, cIn[1] - n[1] * r + d[1] * r, cIn[2] - n[2] * r + d[2] * r], d, uu, vv);
          }
          const dm = norm([n[0] + s * W[0], n[1] + s * W[1], n[2] + s * W[2]]);
          quad(b0, dm);
        }
      };
      if (ou0) strip(true, -1, iv0, iv1);
      if (ou1) strip(true, 1, iv0, iv1);
      if (ov0) strip(false, -1, iu0, iu1);
      if (ov1) strip(false, 1, iu0, iu1);
      // a corner of a sphere where two outer sides meet
      const corner = (su, sv) => {
        const cIn = at(su > 0 ? 1 - r : r, sv > 0 ? 1 - r : r);
        for (let i = 0; i < A3.length - 1; i++)
          for (let j = 0; j < A3.length - 1; j++) {
            b0 = base();
            for (const [a, c] of [
              [A3[i], A3[j]],
              [A3[i + 1], A3[j]],
              [A3[i + 1], A3[j + 1]],
              [A3[i], A3[j + 1]],
            ]) {
              const d = norm([
                n[0] + su * a * U[0] + sv * c * V[0],
                n[1] + su * a * U[1] + sv * c * V[1],
                n[2] + su * a * U[2] + sv * c * V[2],
              ]);
              const uu = su > 0 ? 1 - r + r * a : r - r * a,
                vv = sv > 0 ? 1 - r + r * c : r - r * c;
              vert([cIn[0] - n[0] * r + d[0] * r, cIn[1] - n[1] * r + d[1] * r, cIn[2] - n[2] * r + d[2] * r], d, uu, vv);
            }
            quad(b0, norm([n[0] + su * U[0] + sv * V[0], n[1] + su * U[1] + sv * V[1], n[2] + su * U[2] + sv * V[2]]));
          }
      };
      if (ou0 && ov0) corner(-1, -1);
      if (ou1 && ov0) corner(1, -1);
      if (ou1 && ov1) corner(1, 1);
      if (ou0 && ov1) corner(-1, 1);
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
                            : (b.bt && b.bt[bi]) || b.t,
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
              uvs = [],
              fuv = [];
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
              fuv.push([uu, vv]);
            }
            // the face's sides that are an outer edge: where the block beside it, along that side, lets the
            // face end in the open (a step, a cliff, a corner); not where the land goes on flat
            // (exactly where the block's face on that side is drawn too: the two meet around the edge)
            const side = (dx, dy, dz) => {
              const o = get(x + dx, y + dy, z + dz);
              return y + dy < 0 || isOpaque(o) || (o === id && (b.leaf || b.glass)) ? 0 : 1; // leaves go on into leaves
            };
            let edge;
            if (f.a === 1) edge = side(-1, 0, 0) | (side(1, 0, 0) << 1) | (side(0, 0, -1) << 2) | (side(0, 0, 1) << 3);
            else if (f.a === 0)
              edge =
                (f.n[0] > 0 ? side(0, 0, 1) | (side(0, 0, -1) << 1) : side(0, 0, -1) | (side(0, 0, 1) << 1)) |
                (side(0, -1, 0) << 2) |
                (side(0, 1, 0) << 3);
            else
              edge =
                (f.n[2] > 0 ? side(-1, 0, 0) | (side(1, 0, 0) << 1) : side(1, 0, 0) | (side(-1, 0, 0) << 1)) |
                (side(0, -1, 0) << 2) |
                (side(0, 1, 0) << 3);
            if (edge && G === A.op)
              rounded(
                G,
                f.n,
                pts,
                fuv,
                [u0, u1, v0, v1],
                ao.map(a => AOF[a]),
                ao[0] + ao[2] < ao[1] + ao[3],
                edge,
              );
            else
              pushQ(
                G,
                pts,
                f.n,
                uvs,
                ao.map(a => AOF[a]),
                ao[0] + ao[2] < ao[1] + ao[3],
                edge,
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
            edge: col ? new Float32Array(G[5]) : null,
          }
        : null;
    return { op: one(A.op, true), gl: one(A.gl, true), wa: one(A.wa, false), pl: one(A.pl, false) };
  }
  const buffers = M =>
    Object.values(M)
      .filter(Boolean)
      .flatMap(g => [g.pos.buffer, g.nor.buffer, g.uv.buffer, g.idx.buffer].concat(g.col ? [g.col.buffer, g.edge.buffer] : []));
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
