// npcEngine.js — NPC action resolution, mood updates, faction rep

import { weightedRandom } from "./randomness.js";

// ── Stat helpers ────────────────────────────────────────────────────────────

function clamp(val, min = 0, max = 100) {
  return Math.max(min, Math.min(max, val));
}

function normalizeTrait(value) {
  return clamp(Number(value ?? 50), 0, 100) / 100;
}

function randomFactor(min = 0.9, max = 1.1) {
  return min + Math.random() * (max - min);
}

function rollBaseDelta(action, stat, fallbackDelta = 0) {
  const range = action?.ranges?.[stat];
  if (!range || !Number.isFinite(Number(range.min)) || !Number.isFinite(Number(range.max))) {
    return Math.round(Number(fallbackDelta) || 0);
  }

  let min = Math.round(Number(range.min));
  let max = Math.round(Number(range.max));
  if (min > max) [min, max] = [max, min];
  if (min === max) return min;

  // Inclusive integer roll so both boundaries can be selected directly.
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function fearCapForNPC(npc) {
  const brave = normalizeTrait(npc?.personality?.brave);
  // brave=0 -> cap 100, brave=100 -> cap 25
  return Math.round(100 - brave * 75);
}

function trustCapForNPC(npc) {
  const loyalty = normalizeTrait(npc?.personality?.loyalty);
  return Math.round(70 + loyalty * 30);
}

function respectCapForNPC(npc) {
  const loyalty = normalizeTrait(npc?.personality?.loyalty);
  return Math.round(85 + loyalty * 15);
}

function readinessForNPC(npc) {
  const stats = npc?.stats ?? {};
  const personality = npc?.personality ?? {};
  const trust = clamp(Number(stats.trust ?? 50), -100, 100);
  const fear = clamp(Number(stats.fear ?? 0));
  const respect = clamp(Number(stats.respect ?? 50));
  const aggression = normalizeTrait(personality.aggression) * 100;

  // Higher aggression and lower trust/respect raise readiness to fight.
  // Higher fear also raises readiness because the NPC is more on edge.
  const score =
    20 +
    aggression * 0.5 +
    (100 - trust) * 0.25 +
    (100 - respect) * 0.2 -
    0 +
    fear * 0.15;

  return clamp(Math.round(score));
}

function signOf(n) {
  if (n > 0) return 1;
  if (n < 0) return -1;
  return 0;
}

function getLastNonZeroStatSign(memory, stat) {
  if (!Array.isArray(memory) || !memory.length) return 0;

  for (let i = memory.length - 1; i >= 0; i -= 1) {
    const delta = Number(memory[i]?.statDeltas?.[stat] ?? 0);
    const s = signOf(delta);
    if (s !== 0) return s;
  }

  return 0;
}

function getConsecutiveStatDirectionCount(memory, stat, directionSign) {
  if (!Array.isArray(memory) || !memory.length || !directionSign) return 0;

  let count = 0;
  for (let i = memory.length - 1; i >= 0; i -= 1) {
    const delta = Number(memory[i]?.statDeltas?.[stat] ?? 0);
    const s = signOf(delta);
    if (s === 0) continue;
    if (s !== directionSign) break;
    count += 1;
  }

  return count;
}

function adjustedDelta(npc, actionId, stat, baseDelta, repeatCount = 0, isFirstReversalHit = false) {
  const personality = npc.personality ?? {};
  const traits = npc.traits ?? [];

  const greed = normalizeTrait(personality.greed);
  const loyalty = normalizeTrait(personality.loyalty);
  const aggression = normalizeTrait(personality.aggression);

  let multiplier = 1;

  // Greedy NPCs react more strongly to payment with extra trust gains.
  if (actionId === "pay" && stat === "trust" && baseDelta > 0) {
    multiplier += (greed - 0.5) * 1.0;
    if (traits.includes("greedy")) multiplier += 0.2;
  }

  // Loyalty still shapes positive reactions, but the true ceiling is enforced
  // by the stat cap after the delta is applied.
  if (baseDelta > 0 && (stat === "trust" || stat === "respect")) {
    multiplier += (loyalty - 0.5) * 0.75;
    if (traits.includes("loyal")) multiplier += 0.15;
  }

  // Charm is especially effective at softening NPCs.
  if (actionId === "charm" && (stat === "trust" || stat === "respect") && baseDelta > 0) {
    multiplier += 0.2;
    if (traits.includes("brave")) multiplier += 0.05;
  }

  if (actionId === "charm" && stat === "fear" && baseDelta < 0) {
    multiplier += 0.15;
  }

  // Loyal NPCs are slower to lose trust/respect from hostile actions.
  if (actionId === "threaten" && (stat === "trust" || stat === "respect") && baseDelta < 0) {
    multiplier -= loyalty * 0.45;
    if (traits.includes("loyal")) multiplier -= 0.1;
  }

  // Aggressive NPCs are less affected by fear spikes.
  if (actionId === "threaten" && stat === "fear" && baseDelta > 0) {
    multiplier -= aggression * 0.6;
    if (traits.includes("brave")) multiplier -= 0.1;
    if (traits.includes("coward")) multiplier += 0.2;
  }

  // Repeating the same action builds consistency with this NPC, so impact
  // scales up over time while becoming less random.
  const streakBonus = Math.min(0.6, Math.max(0, repeatCount) * 0.08);
  multiplier += streakBonus;

  // First hit when direction flips should feel much stronger.
  if (isFirstReversalHit) {
    multiplier += 0.45;
  }

  // Keep personality impact bounded and add controlled variation.
  multiplier = clamp(multiplier, 0.35, 1.8);

  const randomSpread = Math.max(0.03, 0.12 - Math.min(0.09, Math.max(0, repeatCount) * 0.015));
  multiplier *= randomFactor(1 - randomSpread, 1 + randomSpread);

  const adjusted = Math.round(baseDelta * multiplier);

  // Preserve sign so changes are never inverted by rounding.
  if (baseDelta > 0) return Math.max(1, adjusted);
  if (baseDelta < 0) return Math.min(-1, adjusted);
  return 0;
}

function getNpcBehaviorProfile(npc) {
  const personality = npc?.personality ?? {};
  const traits = Array.isArray(npc?.traits) ? npc.traits : [];
  const traitSet = new Set(traits);

  return {
    isCoward: traitSet.has("coward"),
    isBrave: traitSet.has("brave"),
    isGreedy: traitSet.has("greedy"),
    isLoyal: traitSet.has("loyal"),
    aggression: Number(personality.aggression ?? 50),
    greed: Number(personality.greed ?? 50),
    loyalty: Number(personality.loyalty ?? 50)
  };
}

function getFactionById(state, factionId) {
  const byId = state?._factionById;
  if (byId instanceof Map) {
    return byId.get(factionId) ?? null;
  }
  return (state?.factions ?? []).find(f => f.id === factionId) ?? null;
}

function normalizeFactionLinkIds(state, factionIds, sourceFactionId) {
  const ids = Array.isArray(factionIds) ? factionIds : [];
  const resolved = [];
  const seen = new Set();

  for (const rawId of ids) {
    const id = String(rawId ?? "").trim();
    if (!id || id === sourceFactionId) continue;
    if (!getFactionById(state, id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    resolved.push(id);
  }

  return resolved;
}

function applyFactionSpillover(state, sourceFactionId, delta) {
  if (!sourceFactionId || delta === 0) return;

  const queue = [{ factionId: sourceFactionId, delta, depth: 0 }];
  const visited = new Set([sourceFactionId]);
  const maxDepth = 3;

  while (queue.length > 0) {
    const current = queue.shift();
    const { factionId, delta: currentDelta, depth } = current;
    if (depth > maxDepth) continue;

    const sourceFaction = getFactionById(state, factionId);
    if (!sourceFaction) continue;

    const affiliatedSet = new Set(normalizeFactionLinkIds(state, sourceFaction.affiliatedFactions, factionId));
    const hatedSet = new Set(normalizeFactionLinkIds(state, sourceFaction.hatedFactions, factionId));

    for (const id of affiliatedSet) {
      hatedSet.delete(id);
    }

    const spillover = Math.max(1, Math.floor(Math.abs(currentDelta) * Math.random() * 0.2));

    for (const affFactionId of affiliatedSet) {
      const linked = getFactionById(state, affFactionId);
      if (!linked) continue;

      const nextRep = clamp((linked.reputation ?? 0) + (currentDelta > 0 ? spillover : -spillover));
      linked.reputation = nextRep;
      state.player.reputation[affFactionId] = nextRep;

      if (!visited.has(affFactionId)) {
        visited.add(affFactionId);
        queue.push({
          factionId: affFactionId,
          delta: currentDelta > 0 ? spillover : -spillover,
          depth: depth + 1
        });
      }
    }

    for (const hatedFactionId of hatedSet) {
      const linked = getFactionById(state, hatedFactionId);
      if (!linked) continue;

      const nextRep = clamp((linked.reputation ?? 0) + (currentDelta > 0 ? -spillover : spillover));
      linked.reputation = nextRep;
      state.player.reputation[hatedFactionId] = nextRep;
    }
  }
}

// ── Outcome pools per action ─────────────────────────────────────────────────

/**
 * Build weighted outcomes for a given action + NPC combo.
 * Weights are modified by NPC traits and personality.
 *
 * @param {string}  actionId
 * @param {object}  npc       Full NPC object
 * @param {object}  action    Action definition from system.actions
 * @returns {Array<{ text, weight, tone }>}
 */
function buildOutcomes(actionId, npc, action) {
  const profile = getNpcBehaviorProfile(npc);

  const isCoward    = profile.isCoward;
  const isBrave     = profile.isBrave;
  const isGreedy    = profile.isGreedy;
  const isLoyal     = profile.isLoyal;
  const aggression  = profile.aggression;
  const greed       = profile.greed;
  const loyalty     = profile.loyalty;

  // ── HELP ────────────────────────────────────────────────────────────────
  if (actionId === "help") {
    return [
      {
        text: `${npc.name} smiles warmly and thanks you sincerely.`,
        tone: "positive",
        weight: 40 + (loyalty > 60 ? 20 : 0) + (isLoyal ? 15 : 0)
      },
      {
        text: `${npc.name} accepts the help but seems distracted.`,
        tone: "neutral",
        weight: 30
      },
      {
        text: `${npc.name} is visibly relieved — you can see real gratitude in their eyes.`,
        tone: "positive",
        weight: 20 + (greed < 40 ? 15 : 0)
      },
      {
        text: `${npc.name} takes the help but can't hide a flicker of suspicion.`,
        tone: "neutral",
        weight: 10 + (isGreedy ? 20 : 0) + (greed > 70 ? 10 : 0)
      }
    ];
  }

  // ── CHARM ───────────────────────────────────────────────────────────────
  if (actionId === "charm") {
    return [
      {
        text: `${npc.name} relaxes and seems genuinely swayed by your charm.`,
        tone: "positive",
        weight: 40 + (loyalty > 60 ? 10 : 0)
      },
      {
        text: `${npc.name} softens noticeably and lowers their guard.`,
        tone: "positive",
        weight: 30 + (greed < 40 ? 5 : 0)
      },
      {
        text: `${npc.name} is cautious, but your words still land well.`,
        tone: "neutral",
        weight: 20 + (isLoyal ? 5 : 0)
      },
      {
        text: `${npc.name} tries not to show it, but the tension eases.`,
        tone: "neutral",
        weight: 10
      }
    ];
  }

  // ── THREATEN ────────────────────────────────────────────────────────────
  if (actionId === "threaten") {
    return [
      {
        text: `${npc.name} backs away, hands raised — clearly frightened.`,
        tone: "negative",
        weight: 35 + (isCoward ? 30 : 0) + (aggression < 30 ? 15 : 0)
      },
      {
        text: `${npc.name} meets your gaze with cold fury and doesn't budge.`,
        tone: "negative",
        weight: 20 + (isBrave ? 25 : 0) + (aggression > 60 ? 20 : 0)
      },
      {
        text: `${npc.name} looks shaken, muttering under their breath as they comply.`,
        tone: "negative",
        weight: 30 + (isCoward ? 15 : 0)
      },
      {
        text: `${npc.name} scoffs and warns you this won't be forgotten.`,
        tone: "negative",
        weight: 15 + (isLoyal ? 20 : 0) + (loyalty > 70 ? 15 : 0)
      }
    ];
  }

  // ── BETRAY ─────────────────────────────────────────────────────────────
  if (actionId === "betray") {
    return [
      {
        text: `${npc.name} looks stunned and betrayed by your actions.`,
        tone: "negative",
        weight: 40 + (isLoyal ? 20 : 0) + (loyalty > 70 ? 15 : 0)
      },
      {
        text: `${npc.name}'s trust collapses as they realize what you have done.`,
        tone: "negative",
        weight: 30 + (isBrave ? 10 : 0)
      },
      {
        text: `${npc.name} turns cold and will not easily forgive this betrayal.`,
        tone: "negative",
        weight: 20 + (isLoyal ? 10 : 0)
      },
      {
        text: `${npc.name} watches you with open hostility after the betrayal.`,
        tone: "negative",
        weight: 10 + (aggression > 60 ? 10 : 0)
      }
    ];
  }

  // ── PAY ─────────────────────────────────────────────────────────────────
  if (actionId === "pay") {
    return [
      {
        text: `${npc.name}'s eyes light up — the coin disappears instantly.`,
        tone: "positive",
        weight: 30 + (isGreedy ? 30 : 0) + (greed > 60 ? 15 : 0)
      },
      {
        text: `${npc.name} accepts the payment with a brief nod of acknowledgement.`,
        tone: "positive",
        weight: 35
      },
      {
        text: `${npc.name} hesitates, then pockets the coin without a word.`,
        tone: "neutral",
        weight: 20 + (isLoyal ? 10 : 0)
      },
      {
        text: `${npc.name} seems almost insulted — but pockets it anyway.`,
        tone: "neutral",
        weight: 15 + (isBrave ? 10 : 0) + (loyalty > 70 ? 10 : 0)
      }
    ];
  }

  // Fallback
  return [{ text: `${npc.name} reacts to your action.`, tone: "neutral", weight: 1 }];
}

// ── Mood derivation ──────────────────────────────────────────────────────────

/**
 * Derive NPC mood from current stats.
 * @param {object} stats  { trust, fear, respect }
 * @returns {string}
 */
function deriveMood(stats) {
  const { trust = 50, fear = 0, respect = 50, readiness = 50 } = stats;

  if (fear >= 60)              return "afraid";
  if (trust >= 70 && respect >= 60 && readiness < 55) return "pleased";
  if (trust <= 25 || respect <= 25 || readiness >= 75) return "hostile";
  if (fear >= 35)              return "wary";
  return "neutral";
}

// ── Faction reputation adjustment ────────────────────────────────────────────

/**
 * Adjust player reputation with an NPC's faction based on action.
 * help/pay → +rep, threaten → −rep
 * Also applies spillover to affiliated (on gain) and hated (on loss) factions.
 */
function adjustFactionRep(state, npc, actionId) {
  const factionId = npc.factionId;
  if (!factionId) return;

  const delta =
    actionId === "help"     ?  4 :
    actionId === "pay"      ?  3 :
    actionId === "betray"   ? -10 :
    actionId === "threaten" ? -5 : 0;

  if (delta === 0) return;

  const current = state.player.reputation[factionId] ?? 0;
  const nextRep = clamp(current + delta);
  state.player.reputation[factionId] = nextRep;
  const sourceFaction = getFactionById(state, factionId);
  if (sourceFaction) {
    sourceFaction.reputation = nextRep;
  }

  // NPC personal links affect the NPC's own faction standing changes directly.
  const npcAffiliatedSet = new Set(normalizeFactionLinkIds(state, npc.affiliatedFactions, factionId));
  const npcHatedSet = new Set(normalizeFactionLinkIds(state, npc.hatedFactions, factionId));
  for (const id of npcAffiliatedSet) {
    npcHatedSet.delete(id);
  }

  const npcSpillover = Math.max(1, Math.floor(Math.abs(delta) * Math.random() * 0.2));
  for (const affFactionId of npcAffiliatedSet) {
    const linked = getFactionById(state, affFactionId);
    if (!linked) continue;
    const linkedRep = clamp((linked.reputation ?? 0) + (delta > 0 ? npcSpillover : -npcSpillover));
    linked.reputation = linkedRep;
    state.player.reputation[affFactionId] = linkedRep;
  }
  for (const hatedFactionId of npcHatedSet) {
    const linked = getFactionById(state, hatedFactionId);
    if (!linked) continue;
    const linkedRep = clamp((linked.reputation ?? 0) + (delta > 0 ? -npcSpillover : npcSpillover));
    linked.reputation = linkedRep;
    state.player.reputation[hatedFactionId] = linkedRep;
  }

  // Faction spillover is also driven by faction-to-faction links stored on the
  // faction record itself, so both layers can coexist.
  applyFactionSpillover(state, factionId, delta);
}

// ── Same-faction social penalty ──────────────────────────────────────────────

function applyGuildRespectPenalty(state, targetNpc, actionId, changedNpcIds) {
  if (actionId !== "threaten") return;
  if (!targetNpc.factionId) return;
  if (targetNpc.dead) return;

  for (const npc of state.npcs) {
    if (npc.id === targetNpc.id) continue;
    if (npc.factionId !== targetNpc.factionId) continue;
    if (npc.dead) continue;
    if (!npc.stats || typeof npc.stats.respect !== "number") continue;
    const before = npc.stats.respect;
    npc.stats.respect = clamp(npc.stats.respect - 3);
    if (npc.stats.respect !== before) changedNpcIds.add(npc.id);
  }
}

function applySameGuildThreatTrustLoss(state, targetNpc, actionId, targetTrustDelta, changedNpcIds) {
  if (actionId !== "threaten") return;
  if (!targetNpc.factionId) return;
  if (targetNpc.dead) return;

  const targetLoss = Math.max(0, -Number(targetTrustDelta || 0));
  const spilloverLoss = Math.floor(targetLoss / 2);
  if (spilloverLoss <= 0) return;

  for (const npc of state.npcs) {
    if (npc.id === targetNpc.id) continue;
    if (npc.factionId !== targetNpc.factionId) continue;
    if (npc.dead) continue;
    if (!npc.stats || typeof npc.stats.trust !== "number") continue;

    const before = npc.stats.trust;
    npc.stats.trust = clamp(npc.stats.trust - spilloverLoss);
    if (npc.stats.trust !== before) changedNpcIds.add(npc.id);
    npc.state.mood = deriveMood(npc.stats);
  }
}

function applySameGuildHelpTrust(state, targetNpc, actionId, targetTrustDelta, changedNpcIds) {
  if (actionId !== "help") return;
  if (!targetNpc.factionId) return;
  if (targetNpc.dead) return;

  const spillover = Math.floor(Math.max(0, targetTrustDelta) / 2);
  if (spillover <= 0) return;

  for (const npc of state.npcs) {
    if (npc.id === targetNpc.id) continue;
    if (npc.factionId !== targetNpc.factionId) continue;
    if (npc.dead) continue;
    if (!npc.stats || typeof npc.stats.trust !== "number") continue;

    const before = npc.stats.trust;
    npc.stats.trust = clamp(npc.stats.trust + spillover);
    if (npc.stats.trust !== before) changedNpcIds.add(npc.id);
    npc.state.mood = deriveMood(npc.stats);
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Apply an action to a specific NPC.
 *
 * @param {object} state    Full game state (mutated in-place)
 * @param {string} npcId
 * @param {string} actionId
 * @returns {{ outcome: object, npc: object, statDeltas: object }}
 */
export function applyAction(state, npcId, actionId) {
  const npc = (state?._npcById instanceof Map ? state._npcById.get(npcId) : null)
    ?? state.npcs.find(n => n.id === npcId);
  if (!npc) throw new Error(`[npcEngine] NPC not found: ${npcId}`);

  const beforeNpcStateById = new Map();
  for (const item of (state.npcs ?? [])) {
    beforeNpcStateById.set(item.id, {
      mood: item?.state?.mood ?? "neutral",
      stats: { ...(item?.stats ?? {}) }
    });
  }

  const beforeFactionRep = new Map();
  for (const faction of (state.factions ?? [])) {
    if (!faction?.id) continue;
    const value = Number(state.player?.reputation?.[faction.id] ?? faction.reputation ?? 0);
    beforeFactionRep.set(faction.id, value);
  }
  for (const [id, value] of Object.entries(state.player?.reputation ?? {})) {
    if (!beforeFactionRep.has(id)) {
      beforeFactionRep.set(id, Number(value ?? 0));
    }
  }

  const changedNpcIds = new Set([npc.id]);

  if (npc.dead) {
    return {
      outcome: { text: `${npc.name} is dead and cannot react.`, tone: "neutral" },
      npc,
      statDeltas: {}
    };
  }

  const action = state.system.actions.find(a => a.id === actionId);
  if (!action) throw new Error(`[npcEngine] Action not found: ${actionId}`);

  const prevMood = npc.state?.mood ?? "neutral";

  // 1. Build weighted outcomes
  const outcomes = buildOutcomes(actionId, npc, action);

  // 2. Pick outcome
  const outcome = weightedRandom(outcomes);

  // 3. Apply stat effects
  const statDeltas = {};
  const effectKeys = Object.keys(action.effects ?? {});
  const rangeKeys = Object.keys(action.ranges ?? {});
  const allStats = Array.from(new Set([...effectKeys, ...rangeKeys]));

  for (const stat of allStats) {
    // Skip stats that are disabled for this action
    if (action.ranges?.[stat]?.enabled === false) {
      continue;
    }

    const fallbackDelta = Number(action.effects?.[stat] ?? 0);
    const baseDelta = rollBaseDelta(action, stat, fallbackDelta);
    if (stat in npc.stats) {
      const directionSign = signOf(baseDelta);
      const repeatCount = getConsecutiveStatDirectionCount(npc.memory, stat, directionSign);
      const lastSign = getLastNonZeroStatSign(npc.memory, stat);
      const isFirstReversalHit = directionSign !== 0 && lastSign !== 0 && directionSign !== lastSign;

      const before = npc.stats[stat];
      const modDelta = adjustedDelta(npc, actionId, stat, baseDelta, repeatCount, isFirstReversalHit);
      if (stat === "fear") {
        npc.stats[stat] = clamp(before + modDelta, 0, fearCapForNPC(npc));
      } else if (stat === "trust") {
        npc.stats[stat] = clamp(before + modDelta, -100, trustCapForNPC(npc));
      } else if (stat === "respect") {
        npc.stats[stat] = clamp(before + modDelta, 0, respectCapForNPC(npc));
      } else {
        npc.stats[stat] = clamp(before + modDelta);
      }
      statDeltas[stat] = npc.stats[stat] - before; // actual change (may be less at boundary)
      if (statDeltas[stat] !== 0) changedNpcIds.add(npc.id);
    }
  }

  // 4. Adjust faction reputation
  adjustFactionRep(state, npc, actionId);

  // 5. Nearby guild members lose respect when one of their own is threatened.
  applyGuildRespectPenalty(state, npc, actionId, changedNpcIds);

  // 6. Threatening one member makes guild mates trust you less (up to half).
  applySameGuildThreatTrustLoss(state, npc, actionId, statDeltas.trust ?? 0, changedNpcIds);

  // 7. Helping one member slightly improves trust among their guild mates (up to half).
  applySameGuildHelpTrust(state, npc, actionId, statDeltas.trust ?? 0, changedNpcIds);

  // Recompute readiness only for NPCs actually changed by this action.
  for (const id of changedNpcIds) {
    const target = (state?._npcById instanceof Map ? state._npcById.get(id) : null)
      ?? state.npcs.find(n => n.id === id);
    if (!target?.stats) continue;
    const beforeReadiness = Number(target.stats.readiness ?? readinessForNPC(target));
    const nextReadiness = readinessForNPC(target);
    target.stats.readiness = nextReadiness;
    if (id === npc.id && nextReadiness !== beforeReadiness) {
      statDeltas.readiness = nextReadiness - beforeReadiness;
    }
  }

  // 8. Update mood for all affected NPCs after final stat changes.
  for (const id of changedNpcIds) {
    const target = (state?._npcById instanceof Map ? state._npcById.get(id) : null)
      ?? state.npcs.find(n => n.id === id);
    if (!target?.stats || !target?.state) continue;
    target.state.mood = deriveMood(target.stats);
  }

  const factionChanges = [];
  const knownFactionIds = new Set([
    ...beforeFactionRep.keys(),
    ...Object.keys(state.player?.reputation ?? {}),
    ...(state.factions ?? []).map(f => f.id).filter(Boolean)
  ]);

  for (const factionId of knownFactionIds) {
    const before = Number(beforeFactionRep.get(factionId) ?? 0);
    const after = Number(
      state.player?.reputation?.[factionId]
      ?? getFactionById(state, factionId)?.reputation
      ?? before
    );
    const delta = after - before;
    if (delta !== 0) {
      factionChanges.push({ factionId, delta, next: after });
    }
  }

  const affectedNpcs = Array.from(changedNpcIds)
    .filter(id => id !== npc.id)
    .map(id => {
      const found = (state?._npcById instanceof Map ? state._npcById.get(id) : null)
        ?? state.npcs.find(n => n.id === id);
      return {
        id,
        name: found?.name ?? id
      };
    });

  // 9. Record memory entry on target NPC.
  npc.memory.push({
    timestamp: Date.now(),
    actionId,
    outcome: outcome.text,
    statDeltas,
    moodBefore: prevMood,
    moodAfter: npc.state.mood,
    sourceNpcId: npc.id,
    sourceNpcName: npc.name,
    sourceKind: "direct",
    factionChanges,
    affectedNpcs
  });

  if (npc.memory.length > 20) npc.memory = npc.memory.slice(-20);

  for (const changedId of changedNpcIds) {
    if (changedId === npc.id) continue;
    const otherNpc = (state?._npcById instanceof Map ? state._npcById.get(changedId) : null)
      ?? state.npcs.find(n => n.id === changedId);
    if (!otherNpc) continue;

    const before = beforeNpcStateById.get(changedId) ?? { mood: "neutral", stats: {} };
    const nextStats = otherNpc.stats ?? {};
    const statKeys = new Set([...Object.keys(before.stats ?? {}), ...Object.keys(nextStats)]);
    const spilloverDeltas = {};
    for (const key of statKeys) {
      const prevVal = Number(before.stats?.[key] ?? 0);
      const nextVal = Number(nextStats?.[key] ?? 0);
      const delta = nextVal - prevVal;
      if (delta !== 0) spilloverDeltas[key] = delta;
    }

    const moodBefore = before.mood ?? "neutral";
    const moodAfter = otherNpc.state?.mood ?? moodBefore;
    if (Object.keys(spilloverDeltas).length === 0 && moodBefore === moodAfter) continue;

    otherNpc.memory.push({
      timestamp: Date.now(),
      actionId,
      outcome: `Affected by ${npc.name}'s ${actionId}.`,
      statDeltas: spilloverDeltas,
      moodBefore,
      moodAfter,
      sourceNpcId: npc.id,
      sourceNpcName: npc.name,
      sourceKind: "spillover",
      factionChanges: []
    });

    if (otherNpc.memory.length > 20) otherNpc.memory = otherNpc.memory.slice(-20);
  }

  return { outcome, npc, statDeltas, changedNpcIds: Array.from(changedNpcIds) };
}
