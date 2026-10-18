// The hostile mobs of one world, run by the server itself (step 5): the same logic as the browser's
// (src/mobs-core.js), on the terrain it knows (terrain.js), ten times a second. Each mob is in one place for
// everyone; it hunts whoever is closest, strikes them (`mhit`, to that player only: their screen applies the
// blow and may parry it) and fires bolts that everyone nearby sees and can be hit by (`mshot`). Every player
// gets, ten times a second, where the mobs around them stand (`ms`).
//
// A mob's health and death stay in the server's ledger (server.js, mobBlow): the simulation reads it, so a
// mob killed here stays dead until it comes back, and a Merge twin struck down sleeps.
import { MobsCore } from './shared.js';

const { MK, MOB_R, DAY_WATCH, worldClock, nightOf, attackWindow } = MobsCore;
const { SPAWN, ckey, cOf } = globalThis.World;
export const TICK_MS = 100;
const SEE = 48, // blocks: how far around you the mobs are sent
  BOLT_SEE = 96,
  REST_FAR = 24, // a mob never goes to rest with a player this close
  PARRY_REACH = 6,
  IDLE_MS = 500; // a wandering mob's place goes out twice a second
const r2 = v => Math.round(v * 100) / 100;
// what a player's screen needs to draw a mob: its flags
const F = { rush: 1, frenzy: 2, stun: 4, aggro: 8, down: 16 };

// ledger(id): the mob's entry in the server's ledger, if any ({ hp, down, deadUntil }), without creating it
export function createMobSim({ terrain, ledger, send, log = () => {} }) {
  const chunks = new Map(), // key -> { list: [mob], resting: [mob] }
    byId = new Map();
  const W = terrain;
  const dead = (id, now) => {
    const s = ledger(id);
    return !!(s && s.deadUntil && now < s.deadUntil);
  };
  function add(c, a) {
    a.id = MobsCore.mobId(a);
    c.list.push(a);
    byId.set(a.id, a);
  }
  function remove(c, a) {
    const i = c.list.indexOf(a);
    if (i >= 0) c.list.splice(i, 1);
    if (byId.get(a.id) === a) byId.delete(a.id);
  }
  function load(cx, cz, now) {
    const k = ckey(cx, cz);
    if (chunks.has(k) || !terrain.ready(cx, cz)) return;
    const c = { list: [], resting: [], cx, cz };
    chunks.set(k, c);
    for (const a of MobsCore.spawnChunk(W, cx, cz)) if (!dead(MobsCore.mobId(a), now)) add(c, a);
    // the twins know each other again (spawnChunk links them, but one may have been left out as dead)
    for (const a of c.list) if (a.twin && !c.list.includes(a.twin)) a.twin = null;
  }
  function unload(k) {
    const c = chunks.get(k);
    if (!c) return;
    for (const a of [...c.list, ...c.resting]) if (byId.get(a.id) === a) byId.delete(a.id);
    chunks.delete(k);
  }
  // the clock's rules: resting by day, the night prowler, the network attack, a relit validator's guardians
  function rules(c, night, aw, players, now) {
    const k = ckey(c.cx, c.cz);
    if (night < 0.35) {
      for (const a of [...c.list]) {
        if (DAY_WATCH.has(a.type) || a.hp !== MK[a.type].hp) continue;
        if (players.some(p => Math.hypot(p.pos.x - a.p.x, p.pos.y - a.p.y, p.pos.z - a.p.z) < REST_FAR)) continue;
        remove(c, a);
        c.resting.push(a);
      }
    } else if (night > 0.55 && c.resting.length) {
      for (const a of c.resting.splice(0)) {
        Object.assign(a.p, { x: a.hx, y: a.hy, z: a.hz });
        add(c, a);
      }
    }
    // the night prowler comes and goes with the dark
    const pr = c.list.find(a => a.type === 'prowler');
    if (pr && night < 0.35) remove(c, pr);
    else if (!pr && night >= 0.55 && !dead(`${k}|190|prowler`, now)) {
      const a = MobsCore.prowler(W, c.cx, c.cz);
      if (a) add(c, a);
    }
    // the network attack's wave, around the Atrium, during its window
    if (cOf(SPAWN.x) === c.cx && cOf(SPAWN.z) === c.cz) {
      const nodes = c.list.filter(a => a.type === 'corrupted_node');
      if (!aw.active || (nodes.length && nodes[0].windowId !== aw.windowId)) for (const a of nodes) remove(c, a);
      if (aw.active) {
        const taken = new Set(c.list.filter(a => a.type === 'corrupted_node').map(a => a.slot));
        for (const a of MobsCore.attackNodes(W, aw, s => taken.has(s) || dead(`${k}|${400 + s}|corrupted_node`, now))) add(c, a);
      }
    }
    // a guardian whose validator was relit (by anyone) is gone for good
    for (const a of [...c.list]) if (a.type === 'guardian' && W.get(a.rx, a.ry + 1, a.rz) !== 73) remove(c, a);
  }
  function tick(players, dt, now = Date.now()) {
    const here = players.filter(p => p.pos);
    // the chunks around the players: loaded (when their terrain has been read), the others dropped
    const want = new Set();
    let budget = 3; // new chunks generated per tick, for all the players together
    for (const p of here) {
      const pcx = cOf(p.pos.x),
        pcz = cOf(p.pos.z);
      budget = terrain.around(pcx, pcz, MOB_R + 1, budget);
      for (let dz = -MOB_R; dz <= MOB_R; dz++)
        for (let dx = -MOB_R; dx <= MOB_R; dx++) {
          want.add(ckey(pcx + dx, pcz + dz));
          if (terrain.has(pcx + dx, pcz + dz)) load(pcx + dx, pcz + dz, now);
        }
    }
    for (const k of [...chunks.keys()]) if (!want.has(k)) unload(k);
    const night = nightOf(worldClock(now).day),
      aw = attackWindow(now);
    for (const c of chunks.values()) rules(c, night, aw, here, now);
    // the players as the mobs see them
    const cands = () =>
      here.map(p => ({ id: p.id, x: p.pos.x, y: p.pos.y, z: p.pos.z, ward: !!p.ward, ladder: !!p.ladder, canHurt: true, p }));
    const ev = {
      now,
      melee(a, tg) {
        send(tg.p, { t: 'mhit', id: a.id, dmg: MK[a.type].dmg, x: r2(a.p.x), z: r2(a.p.z), kind: 'melee' });
      },
      fire(a, R, tg) {
        const [x, y, z] = MobsCore.eye(a),
          tx = tg.x,
          ty = tg.y + 1.2,
          tz = tg.z,
          dd = Math.hypot(tx - x, ty - y, tz - z) || 1,
          msg = JSON.stringify({
            t: 'mshot',
            id: a.id,
            to: tg.id,
            x: r2(x),
            y: r2(y),
            z: r2(z),
            vx: r2(((tx - x) / dd) * R.speed),
            vy: r2(((ty - y) / dd) * R.speed),
            vz: r2(((tz - z) / dd) * R.speed),
            dmg: R.dmg,
            c: R.color,
            s: R.size || 1.6,
          });
        for (const p of here) if (Math.hypot(p.pos.x - x, p.pos.z - z) <= BOLT_SEE) send(p, msg);
      },
      summon(a, i, x, y, z) {
        const c = chunks.get(a.k),
          id = `${a.k}|${i}|mev_bot`;
        if (!c || byId.has(id) || dead(id, now)) return;
        const m = MobsCore.mob('mev_bot', a.k, i, x, y, z, null);
        m.arena = { ...a.arena, reach: 0 };
        m.provoked = 15;
        add(c, m);
      },
    };
    for (const c of chunks.values())
      for (const a of [...c.list]) {
        const s = ledger(a.id);
        if (s) {
          if (s.deadUntil && now < s.deadUntil) {
            remove(c, a); // killed: gone until it comes back (a chunk loaded again after that)
            continue;
          }
          if (s.down && now < s.down) {
            a.hp = 0;
            a.down = 1; // a Merge twin, dormant: it waits
            continue;
          }
          if (a.down) {
            // the twin rises again, at 60% (as the game always had it)
            a.down = 0;
            s.down = 0;
            s.hp = Math.round(MK[a.type].hp * 0.6);
          }
          a.hp = s.hp;
        }
        if (a.hp <= 0) continue;
        const list = cands(),
          tg = MobsCore.target(a, list),
          st = MobsCore.step(W, a, tg, dt, ev);
        a.aggro = st.aggro;
      }
  }
  // what each player sees: the mobs within SEE blocks. A mob on the hunt goes out every time; one quietly
  // wandering only twice a second (it barely moves: the screen smooths it), which saves most of the traffic
  function view(p, now = Date.now()) {
    const l = [],
      sent = (p.mobSent ||= new Map());
    for (const c of chunks.values())
      for (const a of c.list) {
        if (Math.hypot(a.p.x - p.pos.x, a.p.z - p.pos.z) > SEE) continue;
        if (!a.aggro && !(a.stunT > 0) && !(a.chargeT > 0) && now - (sent.get(a.id) || 0) < IDLE_MS) continue;
        sent.set(a.id, now);
        const f =
          (a.rushT > 0 ? F.rush : 0) |
          (a.frenzy ? F.frenzy : 0) |
          (a.stunT > 0 ? F.stun : 0) |
          (a.aggro ? F.aggro : 0) |
          (a.down ? F.down : 0);
        const charge = a.chargeT > 0 && MK[a.type].ranged ? r2(1 - a.chargeT / MK[a.type].ranged.charge) : 0;
        l.push([a.id, r2(a.p.x), r2(a.p.y), r2(a.p.z), r2(a.r.y), r2(a.hp), f, charge]);
      }
    if (sent.size > 400) for (const [id, t] of sent) if (now - t > 5000) sent.delete(id);
    return l;
  }
  return {
    tick,
    view,
    find: id => byId.get(id) || null,
    // a blow landed (the ledger already took the health off): it's knocked back and provoked
    struck(id, fx, fz, hp) {
      const a = byId.get(id);
      if (!a) return;
      a.provoked = 15;
      a.hp = hp;
      MobsCore.knock(a, fx, fz);
    },
    // a player parried this mob's blow: it reels back from them
    parry(p, id) {
      const a = byId.get(id);
      if (!a || !p.pos || Math.hypot(a.p.x - p.pos.x, a.p.z - p.pos.z) > PARRY_REACH) return false;
      MobsCore.parried(a, p.pos.x, p.pos.z);
      return true;
    },
    count: () => byId.size,
    // a mob put down by hand in a loaded chunk (the tests)
    place(a) {
      const c = chunks.get(a.k);
      if (c) add(c, a);
      return !!c;
    },
    chunks,
  };
}
