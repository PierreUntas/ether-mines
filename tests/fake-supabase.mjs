// A fake Supabase broker for the network tests (realtime.test.mjs, gameserver.test.mjs): channels with
// broadcast and presence, counting messages the way Supabase bills them, and net.js loaded in a sandbox.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../src/net.js', import.meta.url), 'utf8');

export function broker() {
  const subs = new Map(); // channel name -> Set of channels
  const b = { billed: 0 };
  const members = name => subs.get(name) || new Set();
  b.client = () => {
    const mk = name => {
      const h = [];
      const c = {
        name,
        state: null,
        on(type, filter, cb) {
          h.push({ type, event: filter.event, cb });
          return c;
        },
        subscribe(cb) {
          if (!subs.has(name)) subs.set(name, new Set());
          subs.get(name).add(c);
          cb && cb('SUBSCRIBED');
          return c;
        },
        send({ event, payload }) {
          b.billed++;
          for (const o of members(name))
            if (o !== c)
              for (const x of o.h)
                if (x.type === 'broadcast' && x.event === event) {
                  b.billed++;
                  x.cb({ payload });
                }
        },
        async track(state) {
          c.state = state;
          for (const o of members(name)) for (const x of o.h) if (x.type === 'presence') x.cb();
        },
        presenceState() {
          const st = {};
          for (const o of members(name)) if (o.state) st[o.key] = [o.state];
          return st;
        },
        h,
      };
      return c;
    };
    let key = null;
    return {
      setKey: k => (key = k),
      channel(name, cfg) {
        const c = mk(name);
        c.key = cfg?.config?.presence?.key || key;
        return c;
      },
      removeChannel(c) {
        members(c.name).delete(c);
      },
      auth: {},
      rpc: async () => ({}),
    };
  };
  return b;
}

export function player(b, id, config = {}, extra = {}) {
  const fake = b.client();
  fake.setKey(id);
  const ctx = {
    window: { CONFIG: { SUPABASE_URL: 'x', SUPABASE_ANON_KEY: 'y', ...config }, supabase: { createClient: () => fake } },
    setTimeout,
    clearTimeout,
    console,
    ...extra,
  };
  if (extra.token) fake.auth.getSession = async () => ({ data: { session: { access_token: extra.token } } });
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const Net = ctx.window.Net,
    got = [];
  let peers = [];
  Net.on('pos', p => got.push(p));
  Net.on('peers', l => (peers = l));
  return { Net, got, peers: () => peers, id };
}
