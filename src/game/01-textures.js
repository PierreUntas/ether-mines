// Ether Mines · Pixel art texture atlas, generated in code.
// The files in src/game/ load in order and share the same global scope.
'use strict';
// ---------- texture atlas (16 px, procedural pixel art) ----------
const AT = 16,
  AN = 16;
const atlas = document.createElement('canvas');
atlas.width = atlas.height = AT * AN;
const ag = atlas.getContext('2d');
const emis = document.createElement('canvas');
emis.width = emis.height = AT * AN;
const eg = emis.getContext('2d');
eg.fillStyle = '#000';
eg.fillRect(0, 0, 256, 256);
function tile(i, fn) {
  const ox = (i % AN) * AT,
    oy = Math.floor(i / AN) * AT;
  const P = (x, y, c) => {
    if (c === null) {
      ag.clearRect(ox + x, oy + y, 1, 1);
      return;
    }
    ag.fillStyle = c;
    ag.fillRect(ox + x, oy + y, 1, 1);
  };
  const E = (x, y, c) => {
    eg.fillStyle = c;
    eg.fillRect(ox + x, oy + y, 1, 1);
  };
  fn(P, E, i);
}
function noise(P, i, base, list) {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      let c = base;
      const r = hash(i * 131 + x, y, 5);
      let acc = 0;
      for (const [col, p] of list) {
        acc += p;
        if (r < acc) {
          c = col;
          break;
        }
      }
      P(x, y, c);
    }
}
const GR = [
  '#a6ecd8',
  [
    ['#bff5e6', 0.2],
    ['#8edcca', 0.2],
    ['#d6fbf1', 0.05],
  ],
];
const DI = [
  '#c3b6ee',
  [
    ['#b0a2e3', 0.25],
    ['#d6ccf6', 0.15],
    ['#9d8fd6', 0.06],
  ],
];
const ST = [
  '#aab6e6',
  [
    ['#97a3d8', 0.25],
    ['#bfc9f0', 0.2],
    ['#8a95cc', 0.06],
  ],
];
tile(0, (P, E, i) => noise(P, i, ...GR));
tile(2, (P, E, i) => noise(P, i, ...DI));
tile(1, (P, E, i) => {
  noise(P, 2, ...DI);
  for (let x = 0; x < 16; x++) {
    const d = 3 + (hash(x, 1, 9) < 0.45 ? 1 : 0) + (hash(x, 2, 9) < 0.15 ? 1 : 0);
    for (let y = 0; y < d; y++) P(x, y, hash(x, y, 3) < 0.25 ? '#bff5e6' : '#a6ecd8');
    P(x, d, '#8edcca');
  }
});
tile(3, (P, E, i) => noise(P, i, ...ST));
tile(4, (P, E, i) =>
  noise(P, i, '#f6e3c4', [
    ['#ecd3ae', 0.25],
    ['#fbeed8', 0.15],
    ['#e2c59c', 0.04],
  ]),
);
tile(5, (P, E, i) => {
  noise(P, i, '#cda07c', [
    ['#d8ad8a', 0.2],
    ['#bf9270', 0.15],
  ]);
  for (const x of [2, 6, 11, 14]) for (let y = 0; y < 16; y++) if (hash(x, y, 4) < 0.8) P(x, y, '#a87d5d');
});
tile(6, (P, E, i) => {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      P(x, y, x === 0 || y === 0 || x === 15 || y === 15 ? '#a87d5d' : Math.floor(d) % 3 === 0 ? '#caa07e' : '#ecc9a2');
    }
});
tile(7, (P, E, i) => {
  noise(P, i, '#8fd0e6', [
    ['#b0e4f2', 0.22],
    ['#a99cf0', 0.22],
    [null, 0.1],
  ]);
});
tile(8, (P, E, i) => {
  noise(P, i, '#ffbcdc', [
    ['#ffd3e8', 0.22],
    ['#f29cc6', 0.2],
    [null, 0.1],
  ]);
});
tile(9, (P, E, i) => {
  noise(P, 3, ...ST);
  for (const [cx, cy] of [
    [4, 4],
    [11, 6],
    [6, 11],
    [12, 12],
  ]) {
    for (const [dx, dy, c] of [
      [0, -2, '#c9f7ff'],
      [-1, -1, '#7fe8ff'],
      [0, -1, '#c9f7ff'],
      [1, -1, '#3fc6f5'],
      [-1, 0, '#7fe8ff'],
      [0, 0, '#7fe8ff'],
      [1, 0, '#3fc6f5'],
      [0, 1, '#3fc6f5'],
    ]) {
      P(cx + dx, cy + dy, c);
      E(cx + dx, cy + dy, c);
    }
  }
});
tile(10, (P, E, i) => {
  noise(P, i, '#f2cfa6', [
    ['#f7dcbc', 0.2],
    ['#e8c298', 0.15],
  ]);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (y % 4 === 3) P(x, y, '#d7ae84');
      const o = [3, 11, 7, 14][Math.floor(y / 4)];
      if (x === o && y % 4 !== 3) P(x, y, '#d7ae84');
    }
});
tile(11, (P, E, i) => {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const b = x === 0 || y === 0 || x === 15 || y === 15;
      P(x, y, b ? '#e6fbff' : 'rgba(200,240,255,.16)');
    }
  for (const [x, y] of [
    [3, 4],
    [4, 3],
    [5, 2],
    [3, 6],
    [4, 5],
    [5, 4],
    [6, 3],
    [11, 11],
    [12, 10],
  ])
    P(x, y, 'rgba(255,255,255,.75)');
});
tile(12, (P, E, i) =>
  noise(P, i, '#5b5782', [
    ['#4a4670', 0.3],
    ['#7a76a3', 0.15],
  ]),
);
const DIAM = [
  [7, 2],
  [8, 2],
  [6, 3],
  [7, 3],
  [8, 3],
  [9, 3],
  [5, 4],
  [6, 4],
  [7, 4],
  [8, 4],
  [9, 4],
  [10, 4],
  [5, 5],
  [6, 5],
  [7, 5],
  [8, 5],
  [9, 5],
  [10, 5],
  [6, 6],
  [7, 6],
  [8, 6],
  [9, 6],
  [7, 7],
  [8, 7],
  [5, 8],
  [10, 8],
  [6, 9],
  [7, 9],
  [8, 9],
  [9, 9],
  [7, 10],
  [8, 10],
  [7, 11],
  [8, 11],
];
tile(13, (P, E, i) => {
  noise(P, i, '#6a58e0', [
    ['#5d4bd6', 0.2],
    ['#7a69ea', 0.2],
  ]);
  for (let k = 0; k < 16; k++) {
    P(k, 0, '#4f40bf');
    P(k, 15, '#4f40bf');
    P(0, k, '#4f40bf');
    P(15, k, '#4f40bf');
  }
  for (const [x, y] of DIAM) {
    const c = x < 8 ? '#ffd24d' : '#ffeaa0';
    P(x, y + 2, c);
    E(x, y + 2, c);
  }
});
tile(14, (P, E, i) => {
  noise(P, i, '#ffe68a', [
    ['#ffd95e', 0.25],
    ['#fff2b8', 0.15],
  ]);
  for (let k = 0; k < 16; k++) {
    P(k, 0, '#e8b93c');
    P(k, 15, '#e8b93c');
    P(0, k, '#e8b93c');
    P(15, k, '#e8b93c');
  }
  for (const [x, y] of [
    [7, 6],
    [8, 6],
    [6, 7],
    [7, 7],
    [8, 7],
    [9, 7],
    [7, 8],
    [8, 8],
    [7, 9],
    [8, 9],
  ]) {
    P(x, y, '#8a7bef');
    E(x, y, '#6a58e0');
  }
});
tile(15, (P, E, i) => {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const b = x < 2 || y < 2 || x > 13 || y > 13;
      const d = Math.hypot(x - 7.5, y - 7.5);
      const c = b ? '#8a7bef' : d < 3 ? '#ffffff' : d < 5 ? '#bff6ff' : '#7fe8ff';
      P(x, y, c);
      if (!b) E(x, y, c);
    }
  for (const k of [2, 13]) {
    for (let y = 2; y < 14; y++) P(k, y, '#6a58e0');
  }
});
tile(16, (P, E, i) => {
  noise(P, i, '#f6f4ff', [
    ['#ffffff', 0.2],
    ['#ebe8fb', 0.15],
  ]);
  for (let k = 0; k < 9; k++) {
    P(2 + k, 3 + Math.floor(k * 0.7), '#dcd6f5');
    P(6 + k, 10 + Math.floor(k * 0.4), '#dcd6f5');
  }
});
tile(17, (P, E, i) =>
  noise(P, i, '#ffffff', [
    ['#eef2ff', 0.25],
    ['#e2e8fb', 0.08],
  ]),
);
tile(18, (P, E, i) => {
  noise(P, 3, ...ST);
  for (let x = 0; x < 16; x++) {
    const d = 3 + (hash(x, 4, 9) < 0.5 ? 1 : 0);
    for (let y = 0; y < d; y++) P(x, y, hash(x, y, 6) < 0.2 ? '#eef2ff' : '#ffffff');
  }
});
function flower(P, col, center) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P(x, y, null);
  for (let y = 7; y < 16; y++) {
    P(7, y, '#6fbf8f');
    P(8, y, '#5aa97a');
  }
  P(6, 11, '#6fbf8f');
  P(5, 10, '#6fbf8f');
  P(9, 12, '#6fbf8f');
  P(10, 11, '#6fbf8f');
  for (const [dx, dy] of [
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    P(7 + dx, 5 + dy, col);
  P(7, 5, center);
  P(8, 5, col);
  P(8, 4, col);
  P(8, 6, col);
}
tile(19, P => flower(P, '#ff8fc8', '#fff2b8'));
tile(20, P => flower(P, '#ffd95e', '#ff9f6b'));
tile(21, P => flower(P, '#8fb8ff', '#ffffff'));
tile(22, (P, E, i) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P(x, y, null);
  for (const [x, h] of [
    [2, 7],
    [4, 11],
    [6, 8],
    [8, 13],
    [10, 9],
    [12, 12],
    [14, 6],
  ])
    for (let y = 16 - h; y < 16; y++) P(x + (y < 16 - h / 2 && hash(x, y) < 0.5 ? 1 : 0), y, y < 16 - h * 0.6 ? '#b6efd6' : '#86d4b1');
});
tile(24, (P, E) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P(x, y, null);
  for (const [x, y] of DIAM) {
    const c = x < 8 ? '#7fe8ff' : '#c9f7ff';
    P(x, y + 2, y > 6 ? '#3fc6f5' : c);
    E(x, y + 2, c);
  }
});
function pick(P, head, headD) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P(x, y, null);
  for (let k = 0; k < 11; k++) {
    P(2 + k, 13 - k, '#8a5a33');
    P(3 + k, 13 - k, '#8a5a33');
    P(4 + k, 13 - k, '#b98a5a');
  }
  for (const [x, y] of [
    [6, 2],
    [7, 2],
    [8, 2],
    [6, 3],
    [9, 3],
    [10, 3],
    [11, 4],
    [12, 5],
    [12, 6],
    [13, 6],
    [13, 7],
    [13, 8],
    [13, 9],
    [12, 9],
    [5, 3],
    [4, 3],
    [3, 4],
    [4, 4],
  ])
    P(x, y, head);
  for (const [x, y] of [
    [8, 3],
    [9, 4],
    [10, 4],
    [11, 5],
    [12, 7],
    [12, 8],
    [11, 8],
  ])
    P(x, y, headD);
}
tile(25, P => pick(P, '#f2cfa6', '#d7ae84'));
tile(26, (P, E) => {
  pick(P, '#7fe8ff', '#3fc6f5');
  for (const [x, y] of [
    [6, 2],
    [7, 2],
    [8, 2],
    [9, 3],
    [10, 3],
    [11, 4],
    [12, 5],
    [12, 6],
    [13, 7],
    [13, 8],
  ])
    E(x, y, '#7fe8ff');
});
// ---------- textures v2: construction, circuits, depths (tiles 27 to 52) ----------
const rgbaOf = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const shadeOf = (hex, k) => {
  const n = parseInt(hex.slice(1), 16),
    f = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
};
tile(53, (P, E, t) => {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const r = hash(x * 7 + y, y * 3 + x, 53),
        curl = ((x + (y >> 1)) % 4 === 0) !== ((y + (x >> 2)) % 3 === 0);
      P(x, y, curl ? '#cdbff7' : r < 0.2 ? '#f2edff' : '#e3dbff');
    }
});
PASTELS.forEach(([, c], i) =>
  tile(27 + i, (P, E, t) =>
    noise(P, t, c, [
      [shadeOf(c, 0.95), 0.22],
      [shadeOf(c, 1.03), 0.18],
      [shadeOf(c, 0.9), 0.04],
    ]),
  ),
);
STAINED.forEach(([, c], i) =>
  tile(35 + i, P => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const b = x === 0 || y === 0 || x === 15 || y === 15 || x === 7 || y === 7;
        P(x, y, b ? shadeOf(c, 0.82) : rgbaOf(c, 0.42));
      }
    for (const [x, y] of [
      [2, 3],
      [3, 2],
      [10, 11],
      [11, 10],
      [9, 3],
      [3, 10],
    ])
      P(x, y, 'rgba(255,255,255,.85)');
  }),
);
function doorTile(P, top) {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      let c = x % 5 === 0 ? '#d7ae84' : '#f2cfa6';
      if (x === 0 || x === 15 || (!top && y === 15) || (top && y === 0)) c = '#b98a5a';
      P(x, y, c);
    }
  if (top) {
    for (let y = 4; y < 12; y++)
      for (let x = 3; x < 13; x++) P(x, y, x === 7 || x === 8 || y === 7 || y === 8 ? '#b98a5a' : 'rgba(200,240,255,.35)');
  } else {
    P(12, 5, '#ffd95e');
    P(12, 6, '#ffd95e');
    P(11, 6, '#e8b93c');
  }
}
tile(39, P => doorTile(P, false));
tile(40, P => doorTile(P, true));
function cableTile(P, E, on) {
  const c = on ? '#9ff3ff' : '#7563e6',
    d = on ? '#3fc6f5' : '#4f40bf';
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P(x, y, null);
  for (let k = 0; k < 16; k++)
    for (const w of [7, 8])
      if (hash(k, w, 3) < 0.85) {
        P(k, w, k % 3 ? c : d);
        P(w, k, k % 3 ? c : d);
        if (on) {
          E(k, w, c);
          E(w, k, c);
        }
      }
  for (let y = 6; y < 10; y++)
    for (let x = 6; x < 10; x++) {
      P(x, y, c);
      if (on) E(x, y, c);
    }
}
tile(43, (P, E) => cableTile(P, E, false));
tile(44, (P, E) => cableTile(P, E, true));
function lampTile(P, E, on) {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const b = x < 2 || y < 2 || x > 13 || y > 13,
        d = Math.hypot(x - 7.5, y - 7.5);
      const c = b
        ? '#8a7bef'
        : on
          ? d < 3
            ? '#ffffff'
            : d < 5
              ? '#bff6ff'
              : '#7fe8ff'
          : d < 3
            ? '#8d86c9'
            : d < 5
              ? '#6f6aa6'
              : '#5b5782';
      P(x, y, c);
      if (on && !b) E(x, y, c);
    }
  for (const k of [2, 13]) for (let y = 2; y < 14; y++) P(k, y, '#6a58e0');
}
tile(45, (P, E) => lampTile(P, E, false));
tile(46, (P, E) => lampTile(P, E, true));
tile(47, (P, E) => {
  noise(P, 3, ...ST);
  for (const [cx, cy] of [
    [4, 5],
    [11, 4],
    [7, 11],
    [12, 12],
    [3, 12],
  ])
    for (const [dx, dy, c] of [
      [0, -2, '#f0e0ff'],
      [-1, -1, '#c9a6ff'],
      [0, -1, '#f0e0ff'],
      [1, -1, '#9a6bf0'],
      [-1, 0, '#c9a6ff'],
      [0, 0, '#c9a6ff'],
      [1, 0, '#9a6bf0'],
      [0, 1, '#9a6bf0'],
    ]) {
      P(cx + dx, cy + dy, c);
      E(cx + dx, cy + dy, c);
    }
});
tile(48, (P, E) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P(x, y, null);
  for (const [x, y] of DIAM) {
    const c = y > 6 ? '#9a6bf0' : x < 8 ? '#c9a6ff' : '#f0e0ff';
    P(x, y + 2, c);
    E(x, y + 2, c);
  }
});
tile(49, (P, E) => {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const f = ((x + y) >> 2) % 2,
        g = ((x - y + 16) >> 2) % 2,
        edge = x === 0 || y === 0 || x === 15 || y === 15;
      P(x, y, edge ? '#8a7bef' : f ^ g ? '#c9a6ff' : '#9ff3ff');
      if (!edge) E(x, y, f ^ g ? '#6a48c0' : '#2f9fc0');
    }
});
tile(50, P => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P(x, y, null);
  for (let x = 4; x < 12; x++) for (let y = 12; y < 15; y++) P(x, y, y === 12 ? '#bcc0de' : '#9699bf');
  for (let k = 0; k < 8; k++) {
    P(7 + Math.floor(k / 3), 11 - k, '#b98a5a');
    P(8 + Math.floor(k / 3), 11 - k, '#d7ae84');
  }
  P(10, 3, '#7fe8ff');
  P(11, 3, '#7fe8ff');
  P(10, 2, '#c9f7ff');
});
tile(51, P => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P(x, y, null);
  for (let x = 2; x < 14; x++) {
    P(x, 11, '#ffffff');
    P(x, 12, '#ebe8fb');
    P(x, 13, '#dcd6f5');
  }
});
tile(52, P => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P(x, y, null);
  for (let y = 1; y < 16; y++)
    for (let x = 4; x < 12; x++) {
      let c = x % 3 === 0 ? '#d7ae84' : '#f2cfa6';
      if (x === 4 || x === 11 || y === 1 || y === 15) c = '#b98a5a';
      if (y >= 3 && y < 7 && x > 5 && x < 10) c = 'rgba(200,240,255,.6)';
      P(x, y, c);
    }
  P(10, 10, '#ffd95e');
});
// progression: dark validator, genesis rock, new items
tile(54, (P, E, i) => {
  noise(P, i, '#4a4466', [
    ['#403a5c', 0.25],
    ['#554f73', 0.2],
  ]);
  for (let k = 0; k < 16; k++) {
    P(k, 0, '#332e4d');
    P(k, 15, '#332e4d');
    P(0, k, '#332e4d');
    P(15, k, '#332e4d');
  }
  for (const [x, y] of DIAM) P(x, y + 2, x < 8 ? '#6b6488' : '#7d7799');
});
tile(55, (P, E, i) => {
  noise(P, i, '#8d88a8', [
    ['#7c7799', 0.3],
    ['#a09bb8', 0.15],
  ]);
  for (let k = 0; k < 16; k++) {
    P(k, 0, '#5f5a7d');
    P(k, 15, '#5f5a7d');
    P(0, k, '#5f5a7d');
    P(15, k, '#5f5a7d');
  }
});
tile(56, (P, E) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P(x, y, null);
  for (let y = 3; y < 14; y++)
    for (let x = 4; x < 12; x++) {
      const d = Math.abs(x - 7.5) + Math.abs(y - 8.5) * 0.7;
      if (d < 4.6) {
        const c = d < 1.6 ? '#ffe9a8' : (x + y) % 3 ? '#2b2244' : '#ffb347';
        P(x, y, c);
        if (d < 1.6 || c === '#ffb347') E(x, y, c);
      }
    }
});
tile(57, (P, E) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P(x, y, null);
  for (const [x, y] of DIAM) {
    const c = y > 6 ? '#ff6fae' : x < 8 ? '#ffd24d' : '#fff2b8';
    P(x, y + 2, c);
    E(x, y + 2, c);
  }
  P(7, 7, '#ffffff');
  P(8, 7, '#ffffff');
});
tile(58, (P, E) => {
  pick(P, '#c9a6ff', '#9ff3ff');
  for (const [x, y] of [
    [6, 2],
    [7, 2],
    [8, 2],
    [9, 3],
    [10, 3],
    [11, 4],
    [12, 5],
    [12, 6],
    [13, 7],
    [13, 8],
    [8, 3],
    [9, 4],
    [10, 4],
    [11, 5],
    [12, 7],
    [12, 8],
  ])
    E(x, y, '#c9a6ff');
});
tile(59, (P, E) => {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      P(x, y, d < 6.5 ? (d < 5 ? '#ffd24d' : '#e8b93c') : null);
    }
  for (const [x, y] of DIAM.filter(([, y]) => y < 9)) {
    P(x, y + 3, '#6a58e0');
    E(x, y + 3, '#8a7bef');
  }
});
tile(60, (P, E, i) => {
  noise(P, i, '#2b2244', [
    ['#1f1833', 0.3],
    ['#3a2f5c', 0.18],
  ]);
  for (let k = 0; k < 7; k++) {
    const x = Math.floor(hash(k, 60, 2) * 14) + 1,
      y = Math.floor(hash(k, 61, 2) * 14) + 1;
    P(x, y, '#ffb347');
    E(x, y, '#ff9a3c');
    P(x + 1, y, '#ffe9a8');
    E(x + 1, y, '#ffd27a');
  }
});
// ---------- v4: nature and decoration ----------
const clear = P => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P(x, y, null);
};
// ether mushroom: pale stem, glowing cyan cap
tile(61, (P, E) => {
  clear(P);
  const cap = (cx, h, r) => {
    for (let y = 16 - h; y < 16; y++) P(cx, y, '#e8e2f7');
    for (let dx = -r; dx <= r; dx++)
      for (let dy = 0; dy < 2 + (Math.abs(dx) < r ? 1 : 0); dy++) {
        const x = cx + dx,
          y = 16 - h - 1 - dy + (Math.abs(dx) === r ? 1 : 0),
          c = dy === 0 && hash(x, y, 61) < 0.3 ? '#ffffff' : dx < 0 ? '#5fd8ff' : '#9eeaff';
        P(x, y, c);
        E(x, y, c);
      }
  };
  cap(5, 6, 3);
  cap(11, 4, 2);
});
// reeds: stalks and cattails
tile(62, P => {
  clear(P);
  for (const [x, h, head] of [
    [3, 13, 1],
    [6, 10, 0],
    [8, 15, 1],
    [11, 11, 1],
    [13, 8, 0],
  ]) {
    for (let y = 16 - h; y < 16; y++) P(x, y, y < 16 - h + 2 ? '#b6efd6' : '#6fbf8f');
    if (head) for (let y = 16 - h + 2; y < 16 - h + 6; y++) (P(x, y, '#9a6b4f'), P(x + 1, y, '#80553d'));
  }
});
// water lily seen from above, with a flower
tile(63, P => {
  clear(P);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5),
        encoche = x > 7 && Math.abs(y - 7.5) < 1.2;
      if (d < 7 && !encoche) P(x, y, d > 5.8 ? '#5fae7f' : hash(x, y, 63) < 0.2 ? '#86d4b1' : '#71c493');
    }
  for (const [x, y, c] of [
    [4, 5, '#ffb8d9'],
    [5, 5, '#ffffff'],
    [4, 4, '#ff8fc8'],
    [5, 4, '#ffb8d9'],
  ])
    P(x, y, c);
});
// mossy stone
tile(64, (P, E, i) => {
  noise(P, i, ...ST);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) if (vn2(x / 4, y / 4, 64) > 0.55) P(x, y, hash(x, y, 64) < 0.3 ? '#86d4b1' : '#6fbf8f');
});
// ether bricks
tile(65, P => {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const row = y >> 2,
        joint = y % 4 === 3 || (x + (row % 2) * 4) % 8 === 7;
      P(x, y, joint ? '#c9c2e0' : hash(x >> 3, row, 65) < 0.5 ? (hash(x, y, 66) < 0.2 ? '#b98aa6' : '#c99bb6') : '#b48aa8');
    }
});
// polished granite
tile(66, P => {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      P(x, y, edge ? '#8a8db3' : hash(x, y, 67) < 0.08 ? '#c3c6e2' : vn2(x / 5, y / 5, 66) > 0.6 ? '#b2b6d6' : '#a9adcf');
    }
});
// checkered marble
tile(67, P => {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const white = ((x >> 2) + (y >> 2)) % 2 === 0;
      P(x, y, white ? (hash(x, y, 68) < 0.15 ? '#e7e3f2' : '#f4f2fa') : hash(x, y, 69) < 0.15 ? '#5b4f8c' : '#4b4078');
    }
});
// library: plank frame, colorful books
tile(68, P => {
  const cols = ['#ff9f9a', '#b3dcff', '#aeeccb', '#ffcfae', '#c9b8ff', '#fff0a0'];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const planche = y === 0 || y === 7 || y === 8 || y === 15 || x === 0 || x === 15;
      if (planche) P(x, y, y === 8 || y === 15 ? '#a5764f' : '#c4956a');
      else {
        const ligne = y < 7 ? 0 : 1,
          k = Math.floor((x - 1 + ligne * 3) / 2),
          haut = hash(k, ligne, 70) < 0.3 ? 2 : 1;
        P(x, y, (y < 7 ? y : y - 8) < haut ? '#3a2f5c' : cols[Math.floor(hash(k, ligne, 71) * cols.length)]);
      }
    }
});
// crystal block: cyan facets, glowing
tile(69, (P, E) => {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const f = (x + y) % 8 < 1 || (x - y + 16) % 8 < 1,
        c = f ? '#e6fbff' : (x + y) % 16 < 8 ? '#7fe8ff' : '#5fd0f2';
      P(x, y, c);
      E(x, y, f ? '#bff6ff' : '#2f8fb0');
    }
});
// colored lanterns (same design as the lantern)
function lanternTile(P, E, core, halo, edge) {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const b = x < 2 || y < 2 || x > 13 || y > 13,
        d = Math.hypot(x - 7.5, y - 7.5),
        c = b ? edge : d < 3 ? '#ffffff' : d < 5 ? core : halo;
      P(x, y, c);
      if (!b) E(x, y, c);
    }
  for (const k of [2, 13]) for (let y = 2; y < 14; y++) P(k, y, '#6a58e0');
}
tile(70, (P, E) => lanternTile(P, E, '#ffd6ea', '#ff8fc8', '#c06a9a'));
tile(71, (P, E) => lanternTile(P, E, '#bfe9ff', '#5fb8ff', '#3a5fa8'));
// woven reed mat
tile(72, P => {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const dir = ((x >> 2) + (y >> 2)) % 2 === 0,
        strand = dir ? y % 4 === 0 : x % 4 === 0;
      P(x, y, strand ? '#b58f5e' : dir ? '#d9bb84' : '#ccad78');
    }
});
// ladder: two rails and rungs, transparent background
tile(73, P => {
  clear(P);
  for (let y = 0; y < 16; y++) {
    for (const x of [2, 3, 12, 13]) P(x, y, x === 2 || x === 12 ? '#a5764f' : '#c4956a');
    if (y % 4 === 1) for (let x = 4; x < 12; x++) P(x, y, hash(x, y, 73) < 0.3 ? '#a5764f' : '#c4956a');
  }
});
// fence icon
tile(74, P => {
  clear(P);
  for (const x of [2, 3, 12, 13]) for (let y = 1; y < 16; y++) P(x, y, x % 2 ? '#c4956a' : '#a5764f');
  for (const y of [4, 5, 10, 11])
    for (let x = 0; x < 16; x++) if (x < 2 || x > 3) if (x < 12 || x > 13) P(x, y, y % 2 ? '#a5764f' : '#c4956a');
});
// chest: top in banded planks, front with a golden lock
function chestTile(P, face) {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15,
        band = !face && (x === 3 || x === 12),
        seam = face && y === 6;
      P(x, y, edge || band || seam ? '#7a5238' : y % 4 === 0 ? '#a5764f' : hash(x, y, 75) < 0.15 ? '#b8875c' : '#c4956a');
    }
  if (face)
    for (const [x, y] of [
      [7, 5],
      [8, 5],
      [7, 6],
      [8, 6],
      [7, 7],
      [8, 7],
    ])
      P(x, y, y === 7 ? '#c9a23a' : '#ffd95e');
}
tile(75, P => chestTile(P, false));
tile(76, P => chestTile(P, true));
// ---------- logic gates and clock ----------
// Top: the gate's name and an arrow toward the output (drawn pointing down, then rotated per orientation).
// On the top face, tile x = world x, and the top of the tile = +z.
const LETTERS = {
  A: ['010', '101', '111', '101', '101'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  R: ['110', '101', '110', '101', '101'],
  T: ['111', '010', '010', '010', '010'],
  O: ['111', '101', '101', '101', '111'],
  U: ['101', '101', '101', '101', '111'],
  N: ['1001', '1101', '1011', '1001', '1001'],
};
function gateBase(P, E, on) {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      P(x, y, edge ? '#3a2f5c' : hash(x, y, 80) < 0.12 ? '#4b4078' : '#433870');
    }
}
function gateTile(P, E, word, o, on) {
  gateBase(P, E, on);
  const lum = on ? '#7fe8ff' : '#b8b0e6',
    pt = (x, y, c) => {
      P(x, y, c);
      if (on) E(x, y, c);
    };
  // arrow pointing down (o = 0: output toward -z, at the bottom of the tile), rotated for the other orientations
  const rot = (x, y) => (o === 0 ? [x, y] : o === 1 ? [15 - y, x] : o === 2 ? [15 - x, 15 - y] : [y, 15 - x]);
  for (const [x, y] of [
    [6, 13],
    [7, 13],
    [8, 13],
    [9, 13],
    [7, 14],
    [8, 14],
  ]) {
    const [rx, ry] = rot(x, y);
    pt(rx, ry, on ? '#ffd95e' : '#9a8cf5');
  }
  // the word, centered, readable from behind the gate (where you stand to place it).
  // On the top face, row 0 of the tile is on the +z side: flip the text, then rotate it like the arrow.
  const widths = [...word].map(l => LETTERS[l][0].length),
    w = widths.reduce((a, b) => a + b + 1, -1);
  [...word].forEach((l, i) =>
    LETTERS[l].forEach((row, dy) =>
      [...row].forEach((b, dx) => {
        if (b !== '1') return;
        const x0 = Math.floor((16 - w) / 2) + widths.slice(0, i).reduce((a, b) => a + b + 1, 0);
        const [rx, ry] = rot(x0 + dx, 15 - (6 + dy));
        pt(rx, ry, lum);
      }),
    ),
  );
}
['AND', 'OR', 'NOT'].forEach((word, gi) => {
  for (let o = 0; o < 4; o++) for (const on of [0, 1]) tile(80 + gi * 8 + o * 2 + on, (P, E) => gateTile(P, E, word, o, !!on));
});
// sides: an ether vein, lit up when the gate is active
for (const on of [0, 1])
  tile(104 + on, (P, E) => {
    gateBase(P, E, on);
    for (let x = 1; x < 15; x++) {
      P(x, 8, on ? '#7fe8ff' : '#6a58e0');
      if (on) E(x, 8, '#7fe8ff');
    }
  });
// clock: a dial and a hand
for (const on of [0, 1])
  tile(106 + on, (P, E) => {
    gateBase(P, E, on);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        if (d > 4.6 && d < 5.8) {
          P(x, y, on ? '#ffd95e' : '#9a8cf5');
          if (on) E(x, y, '#ffd95e');
        }
      }
    for (const [x, y] of on
      ? [
          [8, 7],
          [9, 6],
          [10, 5],
        ]
      : [
          [7, 7],
          [7, 6],
          [7, 5],
          [7, 4],
        ]) {
      P(x, y, '#ffffff');
      if (on) E(x, y, '#ffffff');
    }
  });
// ---------- v7: inspired by ethereum.org's illustrations ----------
// palm trunk: top in rings, sides in scales
tile(108, P => {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      P(x, y, d > 6.5 ? '#9a6b4f' : Math.floor(d) % 2 ? '#e3b98c' : '#d2a577');
    }
});
tile(109, P => {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const scale = (y + (x >> 2) * 2) % 4 === 0;
      P(x, y, scale ? '#d9a47e' : hash(x, y, 109) < 0.2 ? '#ffe2c4' : '#f6cfa6');
    }
});
// fronds: ribs and turquoise leaflets, like the palm trees in the illustrations
tile(110, P => {
  clear(P);
  for (const [x0, y0, dx] of [
    [0, 2, 1],
    [15, 7, -1],
    [0, 12, 1],
  ])
    for (let k = 0; k < 16; k++) {
      const x = x0 + dx * k,
        y = y0 + Math.round(k * 0.25);
      if (x < 0 || x > 15 || y > 15) continue;
      P(x, y, '#3f9e8f');
      for (const s of [-1, 1])
        for (let j = 1; j <= 2; j++) {
          const yy = y + s * j + (k % 2);
          if (yy >= 0 && yy < 16 && hash(x, yy, 110) < 0.9) P(x, yy, j === 1 ? '#7fe0c8' : hash(x, k, 111) < 0.3 ? '#b6a4ff' : '#a6f4dc');
        }
    }
});
// amethyst cluster: glowing purple crystals
tile(111, (P, E) => {
  clear(P);
  for (const [cx, h, w] of [
    [4, 9, 2],
    [8, 14, 3],
    [12, 7, 2],
  ])
    for (let y = 16 - h; y < 16; y++) {
      const ww = Math.max(1, Math.round(w * Math.min(1, (y - (16 - h)) / 3)));
      for (let x = cx - ww + 1; x <= cx + ww - 1; x++) {
        const c = x < cx ? '#c9a8ff' : x > cx ? '#9a7bef' : '#efe2ff';
        P(x, y, c);
        E(x, y, c);
      }
    }
});
// marble column: top, then flutes
tile(112, (P, E, i) => {
  noise(P, i, '#f4f2fa', [['#e3def2', 0.2]]);
  for (let k = 0; k < 16; k++) for (const b of [0, 15]) (P(k, b, '#c9c2e0'), P(b, k, '#c9c2e0'));
});
tile(113, P => {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) P(x, y, y < 2 || y > 13 ? '#e3def2' : x % 4 === 0 ? '#c9c2e0' : x % 4 === 2 ? '#ffffff' : '#f4f2fa');
});
// cyan neon: dark panel crossed by glowing bands
tile(114, (P, E) => {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const band = y === 4 || y === 11 || (y === 7 && x > 3 && x < 12);
      const c = band ? (y === 7 ? '#ffb36b' : '#7fe8ff') : hash(x, y, 114) < 0.15 ? '#3a2f70' : '#2f2660';
      P(x, y, c);
      if (band) E(x, y, c);
    }
});
// holographic screen: translucent lavender, lines of code and a small diamond
tile(115, (P, E) => {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      let c = edge ? '#b6a4ff' : null;
      if (!edge && y % 3 === 1 && x > 1 && x < 3 + ((hash(y, 7, 115) * 11) | 0)) c = '#e6dcff';
      if (c) {
        P(x, y, c);
        E(x, y, c);
      } else P(x, y, null);
    }
  for (const [x, y] of [
    [12, 3],
    [11, 4],
    [13, 4],
    [12, 5],
    [12, 6],
  ])
    (P(x, y, '#7fe8ff'), E(x, y, '#7fe8ff'));
});
// diamond block: the Ether Diamond in lavender and mint facets, translucent background
tile(116, (P, E) => {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const dx = Math.abs(x - 7.5),
        top = y <= 9 && dx <= (y - 1) * 0.55,
        bottom = y >= 11 && y <= 15 && dx <= (15 - y) * 0.9;
      if (top || bottom) {
        const c = top ? (x < 8 ? (y > 6 ? '#8fa8ff' : '#c9b8ff') : y > 6 ? '#c9a8ff' : '#a6f4ee') : x < 8 ? '#8fa8ff' : '#c9a8ff';
        P(x, y, c);
        E(x, y, c);
      } else P(x, y, x === 0 || y === 0 || x === 15 || y === 15 ? '#c9b8ff' : null);
    }
});
// game bricks: raised studs
['#c9b8ff', '#a6f4ee', '#8fa8ff', '#ffc9a8'].forEach((base, i) =>
  tile(117 + i, P => {
    const dark = ['#a796e8', '#7fd8d0', '#6f88e8', '#e8a888'][i],
      light = ['#e6dcff', '#d8fffa', '#bfd0ff', '#ffe4d2'][i];
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const lx = x % 8,
          ly = y % 8,
          d = Math.hypot(lx - 3.5, ly - 3.5);
        // round stud: light top, shadow bottom-right, dark seams between the bricks
        P(x, y, lx === 7 || ly === 7 ? dark : d < 1.8 ? light : d < 2.8 ? (lx + ly >= 7 ? dark : light) : base);
      }
  }),
);
// energy blades: dark grip, diagonal glowing edge (same angled-tool silhouette as the pickaxes)
function blade(P, E, core, edge) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P(x, y, null);
  for (let k = 0; k < 4; k++) {
    P(1 + k, 13 - k, '#1c1029');
    P(2 + k, 13 - k, '#1c1029');
    P(3 + k, 13 - k, '#2a1838');
  }
  P(4, 11, '#1c1029');
  P(5, 10, '#1c1029');
  P(3, 11, '#1c1029');
  for (let k = 0; k < 9; k++) {
    const x = 6 + k,
      y = 9 - k;
    P(x - 1, y, core);
    P(x, y, core);
    P(x + 1, y, edge);
    E(x - 1, y, core);
    E(x, y, core);
    E(x + 1, y, edge);
  }
}
tile(121, (P, E) => blade(P, E, '#0a3d4a', '#00eaff')); // Volt Blade
tile(122, (P, E) => blade(P, E, '#241048', '#c9a6ff')); // Pure Ether Blade
// armor plating: chestplate silhouette, dark material with a glowing center seam and shoulder accents
function armorIcon(P, E, glow) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P(x, y, null);
  const dark = '#1c1029',
    mid = '#2a1838';
  for (let y = 2; y < 14; y++) {
    const half = y < 5 ? 6 : y < 10 ? 5 : 4; // shoulders wide, waist narrower
    for (let x = 8 - half; x <= 7 + half; x++) {
      const edgePx = x === 8 - half || x === 7 + half || y === 2 || y === 13;
      P(x, y, edgePx ? dark : mid);
    }
  }
  for (let y = 3; y < 13; y++) {
    P(7, y, glow);
    P(8, y, glow);
    E(7, y, glow);
    E(8, y, glow);
  }
  for (const [x, y] of [
    [2, 3],
    [13, 3],
    [3, 4],
    [12, 4],
  ]) {
    P(x, y, glow);
    E(x, y, glow);
  }
}
tile(123, (P, E) => armorIcon(P, E, '#00eaff')); // Volt Plating
tile(124, (P, E) => armorIcon(P, E, '#c9a6ff')); // Pure Ether Plating
tile(125, (P, E, i) => {
  // Pillow: a soft cream cushion with a shadowed fold down the middle.
  noise(P, i, '#fbf6ea', [
    ['#fffdf5', 0.25],
    ['#f1e8d6', 0.15],
  ]);
  for (let y = 2; y < 14; y++) {
    P(7, y, '#e4d8bf');
    P(8, y, '#e4d8bf');
  }
});
tile(126, (P, E, i) => {
  // A small glass with something to drink: clear rim, cool blue water underneath.
  noise(P, i, '#eef8fb', [
    ['#ffffff', 0.25],
    ['#dcecf2', 0.15],
  ]);
  for (let y = 4; y < 16; y++) for (let x = 0; x < 16; x++) P(x, y, hash(i, x * 16 + y, 4) < 0.3 ? '#8fd9f0' : '#4fb8e0');
  for (let x = 2; x < 14; x++) P(x, 4, '#c8f3ff');
});
tile(127, (P, E, i) => {
  // A small plate: pale ceramic with a thin rim.
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const edge = x < 2 || y < 2 || x > 13 || y > 13;
      P(x, y, edge ? '#cfd6dc' : '#f4f1ea');
    }
});
// ---------- ink outline ----------
// ethereum.org's illustrations are drawn with a navy ink line: every solid tile (no transparency)
// gets an outline, blended with the original color to stay soft. Open-work tiles (leaves, glass, plants) don't get one.
{
  const NO_OUTLINE = new Set([11, 39, 40, 43, 44, 22, 19, 20, 21, 24, 25, 26, 61, 62, 63, 73, 74, 111, 115, 116]);
  const INK = [58, 52, 128],
    NATURAL = new Set([0, 1, 2, 3, 4, 9, 12, 17, 18, 47, 60, 64]); // terrain: lighter line, otherwise the ground looks like tiling
  for (let t = 0; t < AN * AN; t++) {
    if (NO_OUTLINE.has(t)) continue;
    const ox = (t % AN) * AT,
      oy = Math.floor(t / AN) * AT,
      img = ag.getImageData(ox, oy, AT, AT),
      d = img.data;
    let solid = true,
      empty = true;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] < 255) solid = false;
      if (d[i] > 0) empty = false;
    }
    if (!solid || empty) continue;
    for (let y = 0; y < AT; y++)
      for (let x = 0; x < AT; x++) {
        if (x && y && x < AT - 1 && y < AT - 1) continue;
        const i = (y * AT + x) * 4;
        const k = NATURAL.has(t) ? 0.2 : 0.42;
        for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c] * (1 - k) + INK[c] * k);
      }
    ag.putImageData(img, ox, oy);
  }
}
const atlasTex = new THREE.CanvasTexture(atlas),
  emisTex = new THREE.CanvasTexture(emis);
for (const t of [atlasTex, emisTex]) {
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
}
const waterC = document.createElement('canvas');
waterC.width = waterC.height = 32;
{
  const w = waterC.getContext('2d');
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const r = hash(x, y, 77);
      w.fillStyle = r < 0.18 ? '#b8f0f6' : r < 0.3 ? '#7fcbe8' : '#93dcef';
      w.fillRect(x, y, 1, 1);
    }
  for (let k = 0; k < 10; k++) {
    const x = Math.floor(hash(k, 1, 78) * 28),
      y = Math.floor(hash(k, 2, 78) * 30);
    w.fillStyle = '#d7f1ff';
    w.fillRect(x, y, 4, 1);
  }
}
const waterTex = new THREE.CanvasTexture(waterC);
waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
waterTex.magFilter = THREE.NearestFilter;
waterTex.minFilter = THREE.NearestFilter;
waterTex.generateMipmaps = false;
