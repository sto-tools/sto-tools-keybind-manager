export default {
  name: "Team",
  icon: "fas fa-users",
  description: "Team and multiplayer commands",
  commands: {
    loot_roll_need: {
      name: "Roll Need on Loot",
      command: "LootRollNeed",
      description: "Roll Need on team loot (highest priority)",
      syntax: "LootRollNeed",
      icon: "🎲",
    },
    loot_roll_greed: {
      name: "Roll Greed on Loot",
      command: "LootRollGreed",
      description: "Roll Greed on team loot (medium priority)",
      syntax: "LootRollGreed",
      icon: "🎲",
    },
    loot_roll_pass: {
      name: "Pass on Loot",
      command: "LootRollPass",
      description: "Pass on team loot (no roll)",
      syntax: "LootRollPass",
      icon: "🎲",
    },
  },
};
