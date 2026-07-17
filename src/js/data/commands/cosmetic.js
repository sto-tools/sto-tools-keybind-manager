export default {
  name: "Cosmetic",
  icon: "fas fa-palette",
  description: "Character appearance and customization",
  commands: {
    setactivecostume: {
      name: "Set Active Costume",
      command: "setactivecostume",
      description: "Sets current active costume. Requires two modifiers.",
      syntax: "setactivecostume <modifier1> <modifier2>",
      environment: "ground",
      icon: "👕",
      customizable: true,
      parameters: {
        modifier1: {
          type: "text",
          default: "modifier1",
          placeholder:
            "command_definitions.parameter_placeholders.first_modifier",
        },
        modifier2: {
          type: "text",
          default: "modifier2",
          placeholder:
            "command_definitions.parameter_placeholders.second_modifier",
        },
      },
    },
  },
};
