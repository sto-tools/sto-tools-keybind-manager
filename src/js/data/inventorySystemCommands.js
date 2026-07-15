const inventorySystemCommands = {
  inventory: {
    name: "Show/Hide Inventory",
    command: "Inventory",
    description: "Show/hide your inventory",
    syntax: "Inventory",
    icon: "🎒",
  },
  refine_dilithium: {
    name: "Refine Dilithium",
    command: "gensendmessage inventory_root processdilithium",
    description: "Refine dilithium ore from your inventory",
    syntax: "gensendmessage inventory_root processdilithium",
    icon: "⛏️",
  },
};

export default inventorySystemCommands;
