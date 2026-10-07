// Minimal in-memory stand-in for @minecraft/server, enough to drive the scripts in Node.

const props = new Map();
export const _messages = [];
export const _hooks = { startup: [], scriptEvent: [], worldLoad: [], interval: [] };
export const _players = [];

export const world = {
  getDynamicProperty: (k) => props.get(k),
  setDynamicProperty: (k, v) => {
    if (v === undefined) props.delete(k);
    else {
      if (typeof v === "string" && v.length > 32767) throw new Error(`dynamic property too long: ${v.length}`);
      props.set(k, v);
    }
  },
  sendMessage: (m) => _messages.push(m),
  getPlayers: ({ name } = {}) => _players.filter((p) => !name || p.name === name),
  afterEvents: { worldLoad: { subscribe: (cb) => _hooks.worldLoad.push(cb) } },
};

export const system = {
  run: (fn) => setImmediate(fn),
  runTimeout: (fn) => setImmediate(fn),
  runInterval: (fn) => { _hooks.interval.push(fn); return _hooks.interval.length; },
  runJob: (gen) => {
    const step = () => {
      for (let i = 0; i < 10; i++) if (gen.next().done) return;
      setImmediate(step);
    };
    setImmediate(step);
  },
  beforeEvents: { startup: { subscribe: (cb) => _hooks.startup.push(cb) } },
  afterEvents: { scriptEventReceive: { subscribe: (cb) => _hooks.scriptEvent.push(cb) } },
};

export const _props = props;
