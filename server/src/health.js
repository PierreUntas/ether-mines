// The players' hearts, kept by the game server (step 6): the blows of the mobs and of other players, the
// mobs' bolts, the guard and the parry, the armor, coming back slowly, a bed, a tonic, a death. The browser
// only shows what it's told (`hurt`, `hp`); it can't make itself any harder to kill.
// The rules are the game's own (hurtPlayer and tickPlayerHealth in src/game/16-mobs.js).
import { Rules } from './shared.js';

export const MAX_HP = 10;
const PARRY_MS = 350 + 150, // the game's parry window, and room for the guard's word to arrive
  GUARD_ARC = Math.cos((80 * Math.PI) / 180), // in front: within 80 degrees of where you look
  REGEN_MS = 4000, // a heart back every 4 s...
  REGEN_AFTER_HURT_MS = 6000, // ...6 s after a blow
  GRACE_MS = 2500, // just respawned: nobody can hurt you
  REMEMBER_MS = 10 * 60000, // hearts kept for a player who left (a reconnection doesn't heal)
  DODGE_SAFE_MS = 350 + 100, // the game's dodge (16-mobs.js DASH), and room for its word to arrive
  DODGE_EVERY_MS = 1400; // its recharge (1.6 s), a little shorter for the network's jitter
// how often each healing can be asked for (ms): a bed at night, a hunted animal, a tonic the server took
const HEAL_EVERY = { bed: 30000, hunt: 1500, tonic: 0 };
export const BLADES = new Set([106, 107, 301]);
export const ARMOR = Object.fromEntries(
  Object.entries(Rules.ITEM)
    .filter(([, it]) => it.armor)
    .map(([id, it]) => [+id, it.armor]),
);
// the helmet, the gauntlets and the amulet (rules.js ITEM 308-316): what each does, by item id
const statOf = k =>
  Object.fromEntries(
    Object.entries(Rules.ITEM)
      .filter(([, it]) => it[k])
      .map(([id, it]) => [+id, it[k]]),
  );
export const HELM = statOf('helm'),
  POWER = statOf('power'),
  REGEN = statOf('regen');
// what a player wears and owns in a slot: its stat, or 0
export const worn = (p, item, stats, owns) => (item && stats[item] && owns(p, item) ? stats[item] : 0);

// owns(p, item): does this player really have it (the server's own look at their inventory)
export function createHealth({ send, owns }) {
  const memory = new Map(); // "world|id" -> { hp, at }
  const facing = (p, mx, mz) => {
    const dx = mx - p.pos.x,
      dz = mz - p.pos.z,
      d = Math.hypot(dx, dz);
    return d < 0.05 || (-Math.sin(p.yaw || 0) * dx - Math.cos(p.yaw || 0) * dz) / d > GUARD_ARC;
  };
  const guarding = p => !!p.guard && BLADES.has(p.held) && owns(p, p.held);
  const tell = (p, now) => send(p, { t: 'hp', hp: p.hp });
  return {
    // a new connection: the hearts it last had here, or what its screen says (never more than full)
    join(p, claimed, now = Date.now()) {
      const m = memory.get(p.world + '|' + p.id);
      p.hp = m && now - m.at < REMEMBER_MS ? m.hp : Math.max(1, Math.min(MAX_HP, Math.round(Number(claimed) || MAX_HP)));
      p.regenAt = now + REGEN_MS;
      p.invulnUntil = 0;
      p.graceUntil = 0;
      p.healAt = {};
    },
    leave(p, now = Date.now()) {
      if (p.hp !== undefined) memory.set(p.world + '|' + p.id, { hp: p.hp, at: now });
      if (memory.size > 5000) for (const [k, m] of memory) if (now - m.at > REMEMBER_MS) memory.delete(k);
    },
    // can a blow land on them right now (not just struck, not just respawned)?
    open: (p, now = Date.now()) => p.hp > 0 && now >= p.invulnUntil && now >= p.graceUntil,
    // a blow from (mx, mz): 'parry' (none of it, and the striker reels), 'block', 'hit', or null (it can't land)
    hurt(p, dmg, mx, mz, kind = 'melee', now = Date.now(), from) {
      if (!p.pos || !(p.hp > 0) || now < p.invulnUntil || now < p.graceUntil) return null;
      let blocked = false;
      if (guarding(p) && facing(p, mx, mz)) {
        const parry = now - (p.guardAt || 0) < PARRY_MS;
        if (parry || kind === 'bolt') {
          p.invulnUntil = now + 350;
          send(p, { t: 'hurt', dmg: 0, hp: p.hp, x: mx, z: mz, kind, res: parry ? 'parry' : 'block', from });
          return parry ? 'parry' : 'block';
        }
        dmg *= 0.25;
        blocked = true;
      }
      // the plating takes its share, then the helmet takes its share of what's left (24-gear.js armorLeft)
      const armor = p.armor && owns(p, p.armor) ? ARMOR[p.armor] || 0 : 0,
        helm = worn(p, p.helm, HELM, owns);
      dmg = Math.max(blocked ? 0 : 1, Math.round(dmg * (1 - armor) * (1 - helm)));
      if (!dmg) {
        p.invulnUntil = now + 350;
        send(p, { t: 'hurt', dmg: 0, hp: p.hp, x: mx, z: mz, kind, res: 'block', from });
        return 'block';
      }
      p.hp = Math.max(0, p.hp - dmg);
      p.regenAt = now + REGEN_AFTER_HURT_MS;
      p.invulnUntil = now + 500;
      const msg = { t: 'hurt', dmg, hp: p.hp, x: mx, z: mz, kind, res: blocked ? 'block' : 'hit', from };
      if (p.hp <= 0) {
        // fallen: back at the sanctuary, full hearts, a moment out of reach
        msg.dead = 1;
        p.hp = MAX_HP;
        p.graceUntil = now + GRACE_MS;
        p.regenAt = now + REGEN_MS;
      }
      send(p, msg);
      return blocked ? 'block' : 'hit';
    },
    // a heart back now and then
    regen(p, now = Date.now()) {
      if (p.hp === undefined || p.hp >= MAX_HP || now < p.regenAt) return;
      p.hp++;
      p.regenAt = now + REGEN_MS * (1 - worn(p, p.amulet, REGEN, owns)); // an amulet: sooner
      tell(p, now);
    },
    // healing the browser asks for: a bed at night (full), a hunted animal (+1), a tonic the server took (+5)
    heal(p, kind, night, now = Date.now()) {
      // own keys only: an inherited name (toString, valueOf) is no kind of healing
      const every = Object.hasOwn(HEAL_EVERY, kind) ? HEAL_EVERY[kind] : undefined;
      if (every === undefined || p.hp === undefined || p.hp <= 0) return false;
      if (now - (p.healAt[kind] ?? -Infinity) < every) return false;
      if (kind === 'bed' && !night) return false;
      p.healAt[kind] = now;
      p.hp = kind === 'bed' ? MAX_HP : Math.min(MAX_HP, p.hp + (kind === 'tonic' ? 5 : 1));
      tell(p, now);
      return true;
    },
    // a dodge with the Front-Runner Boots (worn and owned): out of reach for a moment, then a recharge
    dodge(p, now = Date.now()) {
      if (p.boots !== 211 || !owns(p, 211) || now - (p.dodgeAt ?? -Infinity) < DODGE_EVERY_MS) return false;
      p.dodgeAt = now;
      p.invulnUntil = Math.max(p.invulnUntil || 0, now + DODGE_SAFE_MS);
      return true;
    },
    // the guard goes up or down (the browser says so the moment it happens)
    guard(p, on, now = Date.now()) {
      if (on && !p.guard) p.guardAt = now;
      p.guard = !!on;
    },
  };
}
