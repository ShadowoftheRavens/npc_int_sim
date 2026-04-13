import test from "node:test";
import assert from "node:assert/strict";

import { initialData } from "../data.js";
import { applyAction } from "../npcEngine.js";
import { saveState, clearState, flushStorageWrites } from "../storage.js";
import { validateConfig, validateNumericRange, validateNPC, validateFaction } from "../validators.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withMockedRandom(value, fn) {
  const originalRandom = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = originalRandom;
  }
}

test("applyAction updates target NPC and records memory", () => {
  const state = clone(initialData);
  const npc = state.npcs[0];

  const originalRandom = Math.random;
  Math.random = () => 0.42;

  try {
    const beforeMemory = npc.memory.length;
    const result = applyAction(state, npc.id, "help");

    assert.equal(result.npc.id, npc.id);
    assert.ok(Array.isArray(result.changedNpcIds));
    assert.ok(result.changedNpcIds.includes(npc.id));
    assert.equal(npc.memory.length, beforeMemory + 1);
    assert.equal(typeof npc.state.mood, "string");
  } finally {
    Math.random = originalRandom;
  }
});

test("applyAction applies faction spillover to linked factions", () => {
  const state = {
    system: clone(initialData.system),
    player: { reputation: { faction_1: 50, faction_2: 40 } },
    factions: [
      { id: "faction_1", name: "A", reputation: 50, affiliatedFactions: ["faction_2"], hatedFactions: [] },
      { id: "faction_2", name: "B", reputation: 40, affiliatedFactions: [], hatedFactions: [] }
    ],
    npcs: [
      {
        id: "npc_t1",
        name: "Test",
        role: "Guard",
        factionId: "faction_1",
        stats: { trust: 50, fear: 10, respect: 40, readiness: 35 },
        personality: { brave: 40, greed: 20, loyalty: 55, aggression: 25 },
        traits: [],
        affiliatedFactions: [],
        hatedFactions: [],
        memory: [],
        state: { mood: "neutral" }
      }
    ],
    _npcById: new Map(),
    _factionById: new Map(),
    _customNpcIdSet: new Set()
  };

  state._npcById.set("npc_t1", state.npcs[0]);
  state._factionById.set("faction_1", state.factions[0]);
  state._factionById.set("faction_2", state.factions[1]);

  const originalRandom = Math.random;
  Math.random = () => 0.9;

  try {
    const beforeLinkedRep = state.player.reputation.faction_2;
    applyAction(state, "npc_t1", "help");
    const afterLinkedRep = state.player.reputation.faction_2;

    assert.ok(afterLinkedRep > beforeLinkedRep);
  } finally {
    Math.random = originalRandom;
  }
});

test("validateConfig catches invalid action ranges", () => {
  const errors = validateConfig({
    actions: [
      {
        id: "help",
        ranges: {
          trust: { min: 10, max: 5 }
        }
      }
    ]
  });

  assert.ok(errors.length > 0);
  assert.ok(errors.some(msg => msg.includes("trust")));
});

test("applyAction remains stable during rapid bursts", () => {
  const state = clone(initialData);
  const npc = state.npcs[0];
  const actionIds = (state.system?.actions ?? []).map(a => a.id).filter(Boolean);

  assert.ok(actionIds.length > 0);

  const originalRandom = Math.random;
  let seed = 17;
  Math.random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  try {
    const loops = 80;
    const beforeMemory = npc.memory.length;
    for (let i = 0; i < loops; i += 1) {
      const actionId = actionIds[i % actionIds.length];
      const result = applyAction(state, npc.id, actionId);
      assert.ok(Array.isArray(result.changedNpcIds));
      assert.ok(result.changedNpcIds.length > 0);
    }

    const updatedNpc = state.npcs.find(n => n.id === npc.id);
    assert.ok(updatedNpc);
    assert.ok(updatedNpc.memory.length > beforeMemory);
    assert.ok(updatedNpc.memory.length <= loops);
    assert.ok(Number.isFinite(updatedNpc.stats.trust));
    assert.ok(Number.isFinite(updatedNpc.stats.fear));
    assert.ok(Number.isFinite(updatedNpc.stats.respect));
    assert.ok(Number.isFinite(updatedNpc.stats.readiness));
    assert.ok(updatedNpc.stats.fear >= 0 && updatedNpc.stats.fear <= 100);
    assert.ok(updatedNpc.stats.readiness >= 0 && updatedNpc.stats.readiness <= 100);
  } finally {
    Math.random = originalRandom;
  }
});

test("applyAction keeps faction reputation bounded over many actions", () => {
  const state = clone(initialData);
  const npc = state.npcs[0];
  const actionIds = (state.system?.actions ?? []).map(a => a.id).filter(Boolean);
  const originalRandom = Math.random;
  Math.random = () => 0.77;

  try {
    for (let i = 0; i < 120; i += 1) {
      applyAction(state, npc.id, actionIds[i % actionIds.length]);
    }

    for (const value of Object.values(state.player?.reputation ?? {})) {
      assert.ok(Number.isFinite(value));
      assert.ok(value >= 0 && value <= 100);
    }
  } finally {
    Math.random = originalRandom;
  }
});

test("storage write queue flushes latest state after burst saves", async () => {
  const originalLocalStorage = globalThis.localStorage;
  const store = new Map();

  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: key => {
      store.delete(key);
    }
  };

  try {
    for (let i = 0; i < 40; i += 1) {
      saveState({ seq: i, npcs: [], factions: [], player: { reputation: {} }, system: { stats: [], actions: [] } });
    }

    await flushStorageWrites();
    const finalRaw = store.get("npc_simulator_state");
    assert.ok(finalRaw);
    const finalState = JSON.parse(finalRaw);
    assert.equal(finalState.seq, 39);
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});

test("applyAction throws clear errors for missing NPC or action", () => {
  const state = clone(initialData);

  assert.throws(() => applyAction(state, "missing_npc", "help"), /NPC not found/i);
  assert.throws(() => applyAction(state, state.npcs[0].id, "missing_action"), /Action not found/i);
});

test("applyAction on dead NPC does not mutate stats or memory", () => {
  const state = clone(initialData);
  const npc = state.npcs[0];
  npc.dead = true;
  const beforeStats = clone(npc.stats);
  const beforeMemory = npc.memory.length;

  const result = applyAction(state, npc.id, "help");

  assert.equal(result.outcome.tone, "neutral");
  assert.deepEqual(result.statDeltas, {});
  assert.equal(npc.memory.length, beforeMemory);
  assert.deepEqual(npc.stats, beforeStats);
});

test("applyAction keeps memory window capped at 20 entries", () => {
  const state = clone(initialData);
  const npc = state.npcs[0];
  const originalRandom = Math.random;
  Math.random = () => 0.5;

  try {
    for (let i = 0; i < 60; i += 1) {
      applyAction(state, npc.id, "help");
    }

    assert.equal(npc.memory.length, 20);
    assert.ok(npc.memory.every(entry => entry && typeof entry.actionId === "string"));
  } finally {
    Math.random = originalRandom;
  }
});

test("applyAction respects disabled stat ranges", () => {
  const state = {
    system: {
      stats: ["trust", "fear", "respect", "readiness"],
      actions: [
        {
          id: "disabled_test",
          label: "Disabled Test",
          effects: { trust: 20, fear: 0, respect: 0 },
          ranges: {
            trust: { min: 20, max: 20, enabled: false },
            fear: { min: 0, max: 0, enabled: true },
            respect: { min: 0, max: 0, enabled: true }
          }
        }
      ]
    },
    player: { reputation: { faction_x: 50 } },
    factions: [
      { id: "faction_x", name: "X", reputation: 50, affiliatedFactions: [], hatedFactions: [] }
    ],
    npcs: [
      {
        id: "npc_disabled",
        name: "Disabled",
        role: "Guard",
        factionId: "faction_x",
        stats: { trust: 40, fear: 20, respect: 40, readiness: 30 },
        personality: { brave: 50, greed: 50, loyalty: 50, aggression: 50 },
        traits: [],
        memory: [],
        state: { mood: "neutral" }
      }
    ]
  };

  const beforeTrust = state.npcs[0].stats.trust;
  const result = applyAction(state, "npc_disabled", "disabled_test");

  assert.equal(state.npcs[0].stats.trust, beforeTrust);
  assert.ok(!("trust" in result.statDeltas));
});

test("storage queue clearState wins when queued after saves", async () => {
  const originalLocalStorage = globalThis.localStorage;
  const store = new Map();

  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: key => {
      store.delete(key);
    }
  };

  try {
    saveState({ seq: 1 });
    saveState({ seq: 2 });
    clearState();
    await flushStorageWrites();
    assert.equal(store.has("npc_simulator_state"), false);
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});

test("validator helpers cover required edge cases", () => {
  assert.equal(validateNumericRange(1, 3, "x"), null);
  assert.match(String(validateNumericRange(5, 1, "x")), /min value cannot be greater/i);

  const npcErrors = validateNPC({ name: "", role: "", factionName: "" });
  assert.ok(npcErrors.length >= 3);

  const factionErrors = validateFaction({ name: "", reputation: Number.NaN });
  assert.ok(factionErrors.length >= 2);

  assert.equal(validateConfig({ actions: [] }).length > 0, true);
});

test("threaten applies same-guild respect and trust spillover", () => {
  const state = {
    system: {
      stats: ["trust", "fear", "respect", "readiness"],
      actions: [{
        id: "threaten",
        label: "Threaten",
        effects: { trust: -12, fear: 20, respect: -4 },
        ranges: {
          trust: { min: -12, max: -12, enabled: true },
          fear: { min: 20, max: 20, enabled: true },
          respect: { min: -4, max: -4, enabled: true }
        }
      }]
    },
    player: { reputation: { f1: 50 } },
    factions: [{ id: "f1", name: "Guild", reputation: 50, affiliatedFactions: [], hatedFactions: [] }],
    npcs: [
      {
        id: "n1", name: "Target", role: "Guard", factionId: "f1",
        stats: { trust: 70, fear: 5, respect: 55, readiness: 40 },
        personality: { brave: 50, greed: 50, loyalty: 50, aggression: 50 },
        traits: [], affiliatedFactions: [], hatedFactions: [], memory: [], state: { mood: "neutral" }
      },
      {
        id: "n2", name: "Peer", role: "Guard", factionId: "f1",
        stats: { trust: 60, fear: 10, respect: 60, readiness: 40 },
        personality: { brave: 50, greed: 50, loyalty: 50, aggression: 50 },
        traits: [], affiliatedFactions: [], hatedFactions: [], memory: [], state: { mood: "neutral" }
      }
    ]
  };

  withMockedRandom(0.5, () => {
    applyAction(state, "n1", "threaten");
  });

  assert.ok(state.npcs[1].stats.respect <= 57);
  assert.ok(state.npcs[1].stats.trust < 60);
});

test("help applies same-guild trust spillover", () => {
  const state = {
    system: {
      stats: ["trust", "fear", "respect", "readiness"],
      actions: [{
        id: "help",
        label: "Help",
        effects: { trust: 10, fear: -2, respect: 2 },
        ranges: {
          trust: { min: 10, max: 10, enabled: true },
          fear: { min: -2, max: -2, enabled: true },
          respect: { min: 2, max: 2, enabled: true }
        }
      }]
    },
    player: { reputation: { f1: 50 } },
    factions: [{ id: "f1", name: "Guild", reputation: 50, affiliatedFactions: [], hatedFactions: [] }],
    npcs: [
      {
        id: "n1", name: "Target", role: "Guard", factionId: "f1",
        stats: { trust: 50, fear: 20, respect: 50, readiness: 40 },
        personality: { brave: 50, greed: 50, loyalty: 50, aggression: 50 },
        traits: [], affiliatedFactions: [], hatedFactions: [], memory: [], state: { mood: "neutral" }
      },
      {
        id: "n2", name: "Peer", role: "Guard", factionId: "f1",
        stats: { trust: 40, fear: 20, respect: 50, readiness: 40 },
        personality: { brave: 50, greed: 50, loyalty: 50, aggression: 50 },
        traits: [], affiliatedFactions: [], hatedFactions: [], memory: [], state: { mood: "neutral" }
      }
    ]
  };

  withMockedRandom(0.5, () => {
    applyAction(state, "n1", "help");
  });

  assert.ok(state.npcs[1].stats.trust > 40);
});

test("dead guild peers are not modified by social spillovers", () => {
  const state = {
    system: clone(initialData.system),
    player: { reputation: { faction_1: 50 } },
    factions: [{ id: "faction_1", name: "A", reputation: 50, affiliatedFactions: [], hatedFactions: [] }],
    npcs: [
      {
        id: "alive_target", name: "Alive", role: "Guard", factionId: "faction_1",
        stats: { trust: 50, fear: 10, respect: 50, readiness: 35 },
        personality: { brave: 40, greed: 20, loyalty: 55, aggression: 25 },
        traits: [], affiliatedFactions: [], hatedFactions: [], memory: [], state: { mood: "neutral" }
      },
      {
        id: "dead_peer", name: "Dead", role: "Guard", factionId: "faction_1", dead: true,
        stats: { trust: 30, fear: 20, respect: 30, readiness: 50 },
        personality: { brave: 40, greed: 20, loyalty: 55, aggression: 25 },
        traits: [], affiliatedFactions: [], hatedFactions: [], memory: [], state: { mood: "neutral" }
      }
    ]
  };
  const before = clone(state.npcs[1].stats);

  withMockedRandom(0.5, () => {
    applyAction(state, "alive_target", "threaten");
  });

  assert.deepEqual(state.npcs[1].stats, before);
});

test("action on NPC without faction does not mutate faction reputation", () => {
  const state = {
    system: clone(initialData.system),
    player: { reputation: { f1: 42 } },
    factions: [{ id: "f1", name: "A", reputation: 42, affiliatedFactions: [], hatedFactions: [] }],
    npcs: [{
      id: "nofaction", name: "NoFaction", role: "Guard", factionId: null,
      stats: { trust: 50, fear: 10, respect: 50, readiness: 35 },
      personality: { brave: 50, greed: 50, loyalty: 50, aggression: 50 },
      traits: [], memory: [], state: { mood: "neutral" }
    }]
  };

  withMockedRandom(0.5, () => {
    applyAction(state, "nofaction", "help");
  });

  assert.equal(state.player.reputation.f1, 42);
  assert.equal(state.factions[0].reputation, 42);
});

test("betray applies strong negative faction delta with clamp", () => {
  const state = {
    system: clone(initialData.system),
    player: { reputation: { f1: 6 } },
    factions: [{ id: "f1", name: "A", reputation: 6, affiliatedFactions: [], hatedFactions: [] }],
    npcs: [{
      id: "n1", name: "Betrayed", role: "Guard", factionId: "f1",
      stats: { trust: 50, fear: 10, respect: 50, readiness: 35 },
      personality: { brave: 50, greed: 50, loyalty: 50, aggression: 50 },
      traits: [], memory: [], state: { mood: "neutral" }
    }]
  };

  withMockedRandom(0.5, () => {
    applyAction(state, "n1", "betray");
  });

  assert.equal(state.player.reputation.f1, 0);
  assert.equal(state.factions[0].reputation, 0);
});

test("NPC personal affiliated and hated links apply directional spillover", () => {
  const state = {
    system: clone(initialData.system),
    player: { reputation: { f1: 50, f2: 50, f3: 50 } },
    factions: [
      { id: "f1", name: "Main", reputation: 50, affiliatedFactions: [], hatedFactions: [] },
      { id: "f2", name: "Allied", reputation: 50, affiliatedFactions: [], hatedFactions: [] },
      { id: "f3", name: "Rival", reputation: 50, affiliatedFactions: [], hatedFactions: [] }
    ],
    npcs: [{
      id: "n1", name: "Linked", role: "Guard", factionId: "f1",
      stats: { trust: 50, fear: 10, respect: 50, readiness: 35 },
      personality: { brave: 50, greed: 50, loyalty: 50, aggression: 50 },
      traits: [], affiliatedFactions: ["f2"], hatedFactions: ["f3"], memory: [], state: { mood: "neutral" }
    }]
  };

  withMockedRandom(0.99, () => {
    applyAction(state, "n1", "help");
  });

  assert.equal(state.player.reputation.f1, 54);
  assert.equal(state.player.reputation.f2, 51);
  assert.equal(state.player.reputation.f3, 49);
});

test("affiliated links override hated links for same faction id", () => {
  const state = {
    system: clone(initialData.system),
    player: { reputation: { f1: 50, f2: 50 } },
    factions: [
      { id: "f1", name: "Main", reputation: 50, affiliatedFactions: [], hatedFactions: [] },
      { id: "f2", name: "Shared", reputation: 50, affiliatedFactions: [], hatedFactions: [] }
    ],
    npcs: [{
      id: "n1", name: "Linked", role: "Guard", factionId: "f1",
      stats: { trust: 50, fear: 10, respect: 50, readiness: 35 },
      personality: { brave: 50, greed: 50, loyalty: 50, aggression: 50 },
      traits: [], affiliatedFactions: ["f2"], hatedFactions: ["f2"], memory: [], state: { mood: "neutral" }
    }]
  };

  withMockedRandom(0.99, () => {
    applyAction(state, "n1", "help");
  });

  assert.equal(state.player.reputation.f2, 51);
});

test("trust cap is enforced from loyalty profile", () => {
  const state = {
    system: {
      stats: ["trust", "fear", "respect", "readiness"],
      actions: [{
        id: "trust_up",
        label: "Trust Up",
        effects: { trust: 30 },
        ranges: { trust: { min: 30, max: 30, enabled: true } }
      }]
    },
    player: { reputation: {} },
    factions: [],
    npcs: [{
      id: "cap", name: "Cap", role: "Guard", factionId: null,
      stats: { trust: 69, fear: 10, respect: 50, readiness: 35 },
      personality: { brave: 50, greed: 50, loyalty: 0, aggression: 50 },
      traits: [], memory: [], state: { mood: "neutral" }
    }]
  };

  withMockedRandom(0.5, () => applyAction(state, "cap", "trust_up"));
  assert.equal(state.npcs[0].stats.trust, 70);
});

test("fear cap is enforced from brave profile", () => {
  const state = {
    system: {
      stats: ["trust", "fear", "respect", "readiness"],
      actions: [{
        id: "fear_up",
        label: "Fear Up",
        effects: { fear: 50 },
        ranges: { fear: { min: 50, max: 50, enabled: true } }
      }]
    },
    player: { reputation: {} },
    factions: [],
    npcs: [{
      id: "fearcap", name: "FearCap", role: "Guard", factionId: null,
      stats: { trust: 40, fear: 0, respect: 40, readiness: 30 },
      personality: { brave: 100, greed: 50, loyalty: 50, aggression: 50 },
      traits: [], memory: [], state: { mood: "neutral" }
    }]
  };

  withMockedRandom(0.5, () => applyAction(state, "fearcap", "fear_up"));
  assert.equal(state.npcs[0].stats.fear, 25);
});

test("range min/max inversion is tolerated and clamped into bounds", () => {
  const state = {
    system: {
      stats: ["trust", "fear", "respect", "readiness"],
      actions: [{
        id: "inverted",
        label: "Inverted",
        effects: { trust: 0 },
        ranges: { trust: { min: 10, max: 5, enabled: true } }
      }]
    },
    player: { reputation: {} },
    factions: [],
    npcs: [{
      id: "inv", name: "Inv", role: "Guard", factionId: null,
      stats: { trust: 40, fear: 10, respect: 40, readiness: 30 },
      personality: { brave: 50, greed: 50, loyalty: 100, aggression: 50 },
      traits: [], memory: [], state: { mood: "neutral" }
    }]
  };

  withMockedRandom(0.0, () => applyAction(state, "inv", "inverted"));
  const d1 = state.npcs[0].stats.trust - 40;
  assert.ok(Number.isFinite(d1));
  assert.ok(d1 > 0);

  state.npcs[0].stats.trust = 40;
  withMockedRandom(0.9999, () => applyAction(state, "inv", "inverted"));
  const d2 = state.npcs[0].stats.trust - 40;
  assert.ok(Number.isFinite(d2));
  assert.ok(d2 > 0);
});

test("storage queue continues after transient localStorage write errors", async () => {
  const originalLocalStorage = globalThis.localStorage;
  const store = new Map();
  let attempts = 0;

  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      attempts += 1;
      if (attempts <= 2) {
        throw new Error("transient write failure");
      }
      store.set(key, String(value));
    },
    removeItem: key => {
      store.delete(key);
    }
  };

  try {
    saveState({ seq: 1, npcs: [], factions: [], player: { reputation: {} }, system: { stats: [], actions: [] } });
    saveState({ seq: 2, npcs: [], factions: [], player: { reputation: {} }, system: { stats: [], actions: [] } });
    saveState({ seq: 3, npcs: [], factions: [], player: { reputation: {} }, system: { stats: [], actions: [] } });
    await flushStorageWrites();

    const finalRaw = store.get("npc_simulator_state");
    assert.ok(finalRaw);
    const finalState = JSON.parse(finalRaw);
    assert.equal(finalState.seq, 3);
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});

test("cyclic faction graph remains bounded under repeated spillover", () => {
  const state = {
    system: clone(initialData.system),
    player: { reputation: { f1: 50, f2: 50, f3: 50, f4: 50 } },
    factions: [
      { id: "f1", name: "A", reputation: 50, affiliatedFactions: ["f2", "f4"], hatedFactions: ["f3"] },
      { id: "f2", name: "B", reputation: 50, affiliatedFactions: ["f3"], hatedFactions: ["f4"] },
      { id: "f3", name: "C", reputation: 50, affiliatedFactions: ["f1"], hatedFactions: ["f2"] },
      { id: "f4", name: "D", reputation: 50, affiliatedFactions: ["f1", "f3"], hatedFactions: [] }
    ],
    npcs: [{
      id: "n1", name: "Cycle", role: "Guard", factionId: "f1",
      stats: { trust: 55, fear: 15, respect: 52, readiness: 30 },
      personality: { brave: 50, greed: 50, loyalty: 50, aggression: 50 },
      traits: [], memory: [], state: { mood: "neutral" }
    }]
  };

  withMockedRandom(0.95, () => {
    for (let i = 0; i < 180; i += 1) {
      const actionId = i % 2 === 0 ? "help" : "threaten";
      applyAction(state, "n1", actionId);
    }
  });

  for (const faction of state.factions) {
    assert.ok(Number.isFinite(faction.reputation));
    assert.ok(faction.reputation >= 0 && faction.reputation <= 100);
  }

  for (const value of Object.values(state.player.reputation)) {
    assert.ok(Number.isFinite(value));
    assert.ok(value >= 0 && value <= 100);
  }
});

test("direct action history stores source and faction change notes", () => {
  const state = {
    system: {
      stats: ["trust", "fear", "respect", "readiness"],
      actions: [{
        id: "help",
        label: "Help",
        effects: { trust: 8, fear: -2, respect: 2 },
        ranges: {
          trust: { min: 8, max: 8, enabled: true },
          fear: { min: -2, max: -2, enabled: true },
          respect: { min: 2, max: 2, enabled: true }
        }
      }]
    },
    player: { reputation: { f1: 50, f2: 40 } },
    factions: [
      { id: "f1", name: "Main", reputation: 50, affiliatedFactions: ["f2"], hatedFactions: [] },
      { id: "f2", name: "Linked", reputation: 40, affiliatedFactions: [], hatedFactions: [] }
    ],
    npcs: [{
      id: "n1", name: "Target", role: "Guard", factionId: "f1",
      stats: { trust: 50, fear: 10, respect: 50, readiness: 30 },
      personality: { brave: 50, greed: 50, loyalty: 50, aggression: 50 },
      traits: [], memory: [], state: { mood: "neutral" }
    }]
  };

  withMockedRandom(0.99, () => {
    applyAction(state, "n1", "help");
  });

  const entry = state.npcs[0].memory.at(-1);
  assert.ok(entry);
  assert.equal(entry.sourceKind, "direct");
  assert.equal(entry.sourceNpcId, "n1");
  assert.equal(entry.sourceNpcName, "Target");
  assert.ok(Array.isArray(entry.factionChanges));
  assert.ok(entry.factionChanges.some(change => change.factionId === "f1" && change.delta > 0));
});

test("affected peer gets spillover history entry with source attribution", () => {
  const state = {
    system: {
      stats: ["trust", "fear", "respect", "readiness"],
      actions: [{
        id: "threaten",
        label: "Threaten",
        effects: { trust: -12, fear: 20, respect: -4 },
        ranges: {
          trust: { min: -12, max: -12, enabled: true },
          fear: { min: 20, max: 20, enabled: true },
          respect: { min: -4, max: -4, enabled: true }
        }
      }]
    },
    player: { reputation: { f1: 50 } },
    factions: [{ id: "f1", name: "Guild", reputation: 50, affiliatedFactions: [], hatedFactions: [] }],
    npcs: [
      {
        id: "n1", name: "Origin", role: "Guard", factionId: "f1",
        stats: { trust: 70, fear: 10, respect: 60, readiness: 30 },
        personality: { brave: 50, greed: 50, loyalty: 50, aggression: 50 },
        traits: [], memory: [], state: { mood: "neutral" }
      },
      {
        id: "n2", name: "Peer", role: "Guard", factionId: "f1",
        stats: { trust: 50, fear: 10, respect: 60, readiness: 30 },
        personality: { brave: 50, greed: 50, loyalty: 50, aggression: 50 },
        traits: [], memory: [], state: { mood: "neutral" }
      }
    ]
  };

  withMockedRandom(0.8, () => {
    applyAction(state, "n1", "threaten");
  });

  const peerEntry = state.npcs[1].memory.at(-1);
  assert.ok(peerEntry);
  assert.equal(peerEntry.sourceKind, "spillover");
  assert.equal(peerEntry.sourceNpcId, "n1");
  assert.equal(peerEntry.sourceNpcName, "Origin");
  assert.match(String(peerEntry.outcome), /Affected by Origin's threaten/i);
  assert.ok(Object.keys(peerEntry.statDeltas ?? {}).length > 0);
});
