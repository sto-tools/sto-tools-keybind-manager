export default {
  name: "Bridge Officer",
  icon: "fas fa-user-friends",
  description: "Ground bridge officer control commands",
  commands: {
    setrallypoint: {
      name: "Set Rally Point",
      command: "Setrallypoint",
      description: "Set a rally point for your current target",
      syntax: "Setrallypoint",
      environment: "ground",
      icon: "📍",
    },
    setrallypointconsole: {
      name: "Set Rally Point (Console)",
      command: "Setrallypointconsole",
      description:
        "Set a rally point for your current target (console variant)",
      syntax: "Setrallypointconsole",
      environment: "ground",
      icon: "🖥️",
    },
    clearrallypoint: {
      name: "Clear Rally Point",
      command: "Clearrallypoint",
      description: "Clear the rally point for your current target",
      syntax: "Clearrallypoint",
      environment: "ground",
      icon: "❌",
    },
    clearallrallypoints: {
      name: "Clear All Rally Points",
      command: "Clearallrallypoints",
      description: "Clear all the rally points",
      syntax: "Clearallrallypoints",
      environment: "ground",
      icon: "🧹",
    },
    assist: {
      name: "Assist",
      command: "Assist",
      description:
        'Assist "<name>": Assists the Entity with the matching name. If no name is given, assists your current target.',
      syntax: "Assist <name>",
      environment: "ground",
      icon: "🤝",
      customizable: true,
      parameters: {
        name: {
          type: "text",
          default: "",
          placeholder:
            "command_definitions.parameter_placeholders.entity_name_optional",
        },
      },
    },
  },
};
