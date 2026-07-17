export default {
  name: "Communication",
  icon: "fas fa-comments",
  description: "Chat and team communication",
  commands: {
    team_message: {
      name: "Team Message",
      command: "team",
      description: "Send message to team",
      syntax: "team message",
      icon: "💬",
      customizable: true,
      parameters: {
        verb: {
          type: "select",
          default: "team",
          options: ["say", "team", "zone"],
        },
        message: { type: "text", default: "Message text here" },
      },
    },
    local_message: {
      name: "Local Message",
      command: "say",
      description: "Send message to local area",
      syntax: "say message",
      icon: "📢",
      customizable: true,
      parameters: {
        verb: {
          type: "select",
          default: "say",
          options: ["say", "team", "zone"],
        },
        message: { type: "text", default: "Message text here" },
      },
    },
    zone_message: {
      name: "Zone Message",
      command: "zone",
      description: "Send message to zone",
      syntax: "zone message",
      icon: "📡",
      customizable: true,
      parameters: {
        verb: {
          type: "select",
          default: "zone",
          options: ["say", "team", "zone"],
        },
        message: { type: "text", default: "Message text here" },
      },
    },
  },
};
