// data.js — Initial game state

export const initialData = {
  system: {
    stats: ["trust", "fear", "respect", "readiness"],
    actions: [
      { id: "help",     label: "Help",     effects: { trust: 10, fear: -5, respect: 8 } },
      { id: "charm",    label: "Charm",    effects: { trust: 14, fear: -8, respect: 10 } },
      { id: "threaten", label: "Threaten", effects: { fear: 15, trust: -5, respect: -8 } },
      { id: "betray",   label: "Betray",   effects: { trust: -14, respect: -14, fear: 6 } },
      { id: "pay",      label: "Pay",      effects: { trust: 5 } }
    ]
  },
  factions: [
    { id: "faction_1", name: "City Guard", reputation: 52, affiliatedFactions: ["faction_4"], hatedFactions: ["faction_3"] },
    { id: "faction_2", name: "Traders Guild", reputation: 58, affiliatedFactions: ["faction_5"], hatedFactions: ["faction_3"] },
    { id: "faction_3", name: "Shadow Thieves", reputation: 40, affiliatedFactions: ["faction_6"], hatedFactions: ["faction_1", "faction_2"] },
    { id: "faction_4", name: "Temple Order", reputation: 55, affiliatedFactions: ["faction_1"], hatedFactions: ["faction_6"] },
    { id: "faction_5", name: "Scholars Circle", reputation: 48, affiliatedFactions: ["faction_2"], hatedFactions: ["faction_6"] },
    { id: "faction_6", name: "Iron Legion", reputation: 46, affiliatedFactions: ["faction_3"], hatedFactions: ["faction_4", "faction_5"] }
  ],
  player: {
    reputation: {
      faction_1: 30,
      faction_2: 44,
      faction_3: 18,
      faction_4: 36,
      faction_5: 28,
      faction_6: 22
    }
  },
  npcs: [
    {
      id: "npc_001",
      name: "Arkon",
      role: "Merchant",
      factionId: "faction_2",
      stats: { trust: 60, fear: 30, respect: 40, readiness: 64 },
      personality: { brave: 20, greed: 80, loyalty: 30, aggression: 10 },
      traits: ["greedy", "coward"],
      affiliatedFactions: ["faction_5"],
      hatedFactions: ["faction_3"],
      memory: [],
      state: { mood: "neutral" }
    },
    {
      id: "npc_002",
      name: "Doran",
      role: "Guard",
      factionId: "faction_1",
      stats: { trust: 40, fear: 10, respect: 70, readiness: 61 },
      personality: { brave: 80, greed: 10, loyalty: 90, aggression: 70 },
      traits: ["brave", "loyal"],
      affiliatedFactions: ["faction_4"],
      hatedFactions: ["faction_3"],
      memory: [],
      state: { mood: "neutral" }
    },
    {
      id: "npc_003",
      name: "Silas",
      role: "Diplomat",
      factionId: "faction_1",
      stats: { trust: 55, fear: 15, respect: 65, readiness: 52 },
      personality: { brave: 50, greed: 40, loyalty: 70, aggression: 30 },
      traits: ["diplomatic", "thoughtful"],
      affiliatedFactions: ["faction_2"],
      hatedFactions: ["faction_3"],
      memory: [],
      state: { mood: "neutral" }
    },
    {
      id: "npc_004",
      name: "Mira",
      role: "Priest",
      factionId: "faction_4",
      stats: { trust: 72, fear: 6, respect: 78, readiness: 44 },
      personality: { brave: 65, greed: 12, loyalty: 88, aggression: 18 },
      traits: ["calm", "loyal"],
      affiliatedFactions: ["faction_1", "faction_5"],
      hatedFactions: ["faction_6"],
      memory: [],
      state: { mood: "pleased" }
    },
    {
      id: "npc_005",
      name: "Varo",
      role: "Thief",
      factionId: "faction_3",
      stats: { trust: -35, fear: 42, respect: 24, readiness: 86 },
      personality: { brave: 35, greed: 92, loyalty: 18, aggression: 84 },
      traits: ["greedy", "sly"],
      affiliatedFactions: ["faction_6"],
      hatedFactions: ["faction_1", "faction_2"],
      memory: [],
      state: { mood: "hostile" }
    },
    {
      id: "npc_006",
      name: "Edrik",
      role: "Soldier",
      factionId: "faction_6",
      stats: { trust: 22, fear: 18, respect: 58, readiness: 73 },
      personality: { brave: 78, greed: 20, loyalty: 62, aggression: 91 },
      traits: ["aggressive", "disciplined"],
      affiliatedFactions: ["faction_3"],
      hatedFactions: ["faction_4", "faction_5"],
      memory: [],
      state: { mood: "wary" }
    },
    {
      id: "npc_007",
      name: "Lysa",
      role: "Scholar",
      factionId: "faction_5",
      stats: { trust: 64, fear: 12, respect: 69, readiness: 49 },
      personality: { brave: 42, greed: 26, loyalty: 76, aggression: 22 },
      traits: ["curious", "careful"],
      affiliatedFactions: ["faction_2"],
      hatedFactions: ["faction_6"],
      memory: [],
      state: { mood: "neutral" }
    },
    {
      id: "npc_008",
      name: "Rauk",
      role: "Assassin",
      factionId: "faction_3",
      stats: { trust: -70, fear: 28, respect: 19, readiness: 93 },
      personality: { brave: 58, greed: 66, loyalty: 8, aggression: 95 },
      traits: ["ruthless", "cold"],
      affiliatedFactions: ["faction_6"],
      hatedFactions: ["faction_1", "faction_4"],
      memory: [],
      state: { mood: "hostile" }
    },
    {
      id: "npc_009",
      name: "Bren",
      role: "Guard",
      factionId: "faction_1",
      stats: { trust: 5, fear: 67, respect: 37, readiness: 82 },
      personality: { brave: 12, greed: 34, loyalty: 54, aggression: 41 },
      traits: ["coward", "nervous"],
      affiliatedFactions: ["faction_4"],
      hatedFactions: ["faction_3"],
      memory: [],
      state: { mood: "afraid" }
    },
    {
      id: "npc_010",
      name: "Neris",
      role: "Mage",
      factionId: "faction_4",
      dead: true,
      stats: { trust: 48, fear: 0, respect: 81, readiness: 0 },
      personality: { brave: 74, greed: 9, loyalty: 95, aggression: 10 },
      traits: ["wise", "fallen"],
      affiliatedFactions: ["faction_1"],
      hatedFactions: ["faction_6"],
      memory: [],
      state: { mood: "neutral" }
    }
  ]
};
