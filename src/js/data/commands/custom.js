export default {
  name: "Custom",
  icon: "fas fa-plus",
  description: "Create commands from raw STO command strings",
  commands: {
    add_custom_command: {
      name: "Add Custom Command",
      command: "", // Raw input – no predefined command string
      description: "Add any STO command as raw text",
      syntax: "<raw command>",
      icon: "➕",
      customizable: true,
      parameters: {
        rawCommand: {
          type: "text",
          default: "",
          placeholder:
            "command_definitions.parameter_placeholders.any_sto_command",
          label: "Command:",
        },
      },
    },
  },
};
