// randomness.js — Weighted random outcome selection

/**
 * Select one outcome from an array using weighted probability.
 *
 * @param {Array<{ text: string, weight: number, [key: string]: any }>} outcomes
 * @returns {object} The selected outcome object
 */
export function weightedRandom(outcomes) {
  if (!outcomes || outcomes.length === 0) {
    throw new Error("[randomness] outcomes array is empty");
  }

  const totalWeight = outcomes.reduce((sum, o) => sum + (o.weight || 0), 0);

  if (totalWeight <= 0) {
    // Fall back to uniform random if all weights are zero
    return outcomes[Math.floor(Math.random() * outcomes.length)];
  }

  let roll = Math.random() * totalWeight;

  for (const outcome of outcomes) {
    roll -= (outcome.weight || 0);
    if (roll <= 0) return outcome;
  }

  // Fallback (floating point edge case)
  return outcomes[outcomes.length - 1];
}
